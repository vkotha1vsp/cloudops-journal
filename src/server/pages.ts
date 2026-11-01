import { db } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { slugify, uniqueSlug } from "@/domain/slug";
import { emptyDoc, extractText, type TiptapNode } from "@/domain/tiptap";
import type { PageStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { forgetEntities } from "@/server/bookmarks";

/** Autosave creates a checkpoint version when the latest one is older than this. */
export const AUTO_CHECKPOINT_MS = 10 * 60_000;

const pageSelect = {
  id: true,
  title: true,
  slug: true,
  icon: true,
  parentId: true,
  topicId: true,
  status: true,
  visibility: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.JournalPageSelect;

export async function listPages(ownerId: string) {
  return db().journalPage.findMany({
    where: { ownerId, status: { not: "ARCHIVED" } },
    select: pageSelect,
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });
}

export async function recentPages(ownerId: string, take = 6) {
  return db().journalPage.findMany({
    where: { ownerId, status: { not: "ARCHIVED" } },
    select: { ...pageSelect, plainText: true },
    orderBy: { updatedAt: "desc" },
    take,
  });
}

export async function getPage(ownerId: string, id: string) {
  const page = await db().journalPage.findFirst({
    where: { id, ownerId },
    include: {
      tags: { include: { tag: true } },
      topic: { select: { id: true, title: true, category: { select: { track: true } } } },
      parent: { select: { id: true, title: true } },
      children: { select: { id: true, title: true }, orderBy: { title: "asc" } },
    },
  });
  if (!page) throw notFound("Page");
  return { ...page, content: page.content as unknown as TiptapNode };
}

async function assertParent(ownerId: string, pageId: string | null, parentId: string | null | undefined) {
  if (!parentId) return;
  if (parentId === pageId) throw badRequest("A page cannot be its own parent");
  const prisma = db();
  let cursor: string | null = parentId;
  let depth = 0;
  while (cursor) {
    const node: { id: string; parentId: string | null } | null = await prisma.journalPage.findFirst({
      where: { id: cursor, ownerId },
      select: { id: true, parentId: true },
    });
    if (!node) throw notFound("Parent page");
    if (pageId && node.parentId === pageId) throw badRequest("That move would create a cycle");
    cursor = node.parentId;
    if (++depth > 50) throw badRequest("Page nesting is too deep");
  }
}

async function assertTopic(ownerId: string, topicId: string | null | undefined) {
  if (!topicId) return;
  const t = await db().topic.findFirst({ where: { id: topicId, ownerId }, select: { id: true } });
  if (!t) throw notFound("Topic");
}

export async function createPage(
  ownerId: string,
  input: { title: string; parentId?: string | null; topicId?: string | null; content?: TiptapNode; icon?: string | null },
) {
  await assertParent(ownerId, null, input.parentId);
  await assertTopic(ownerId, input.topicId);
  const prisma = db();
  const title = input.title.trim() || "Untitled";
  const content = input.content ?? emptyDoc();
  const plainText = extractText(content);
  const base = slugify(title);
  const taken = await prisma.journalPage.findMany({
    where: { ownerId, slug: { startsWith: base } },
    select: { slug: true },
  });

  return prisma.journalPage.create({
    data: {
      ownerId,
      title,
      slug: uniqueSlug(base, taken.map((t) => t.slug)),
      parentId: input.parentId ?? null,
      topicId: input.topicId ?? null,
      icon: input.icon ?? null,
      content: content as Prisma.InputJsonValue,
      plainText,
      version: 1,
      versions: { create: { ownerId, version: 1, title, content: content as Prisma.InputJsonValue, plainText, note: "Created" } },
    },
    select: pageSelect,
  });
}

export type PageUpdate = {
  title?: string;
  content?: TiptapNode;
  status?: PageStatus;
  parentId?: string | null;
  topicId?: string | null;
  icon?: string | null;
  /** Optimistic concurrency: reject if the page changed since the client loaded it. */
  expectedUpdatedAt?: string;
};

export async function updatePage(ownerId: string, id: string, input: PageUpdate) {
  const prisma = db();
  const current = await prisma.journalPage.findFirst({ where: { id, ownerId } });
  if (!current) throw notFound("Page");
  if (input.parentId !== undefined) await assertParent(ownerId, id, input.parentId);
  if (input.topicId !== undefined) await assertTopic(ownerId, input.topicId);

  const data: Prisma.JournalPageUpdateManyMutationInput & { parentId?: string | null; topicId?: string | null } = {};
  if (input.title !== undefined) data.title = input.title.trim() || "Untitled";
  if (input.content !== undefined) {
    data.content = input.content as Prisma.InputJsonValue;
    data.plainText = extractText(input.content);
  }
  if (input.status !== undefined) data.status = input.status;
  if (input.icon !== undefined) data.icon = input.icon;
  if (input.parentId !== undefined) data.parentId = input.parentId;
  if (input.topicId !== undefined) data.topicId = input.topicId;

  const where: Prisma.JournalPageWhereInput = { id, ownerId };
  if (input.expectedUpdatedAt) where.updatedAt = new Date(input.expectedUpdatedAt);

  const result = await prisma.journalPage.updateMany({ where, data });
  if (result.count === 0) {
    const latest = await prisma.journalPage.findFirst({ where: { id, ownerId }, select: { updatedAt: true } });
    if (!latest) throw notFound("Page");
    throw conflict("This page was changed elsewhere. Reload to see the latest version.", {
      updatedAt: latest.updatedAt.toISOString(),
    });
  }

  if (input.content !== undefined || input.title !== undefined) await maybeCheckpoint(ownerId, id);
  return prisma.journalPage.findFirstOrThrow({ where: { id, ownerId }, select: pageSelect });
}

async function maybeCheckpoint(ownerId: string, pageId: string) {
  const last = await db().journalPageVersion.findFirst({
    where: { pageId },
    orderBy: { version: "desc" },
    select: { createdAt: true },
  });
  if (!last || Date.now() - last.createdAt.getTime() >= AUTO_CHECKPOINT_MS) {
    await snapshotPage(ownerId, pageId, "Autosave checkpoint");
  }
}

/** Freeze the page's current state as a new immutable version. */
export async function snapshotPage(ownerId: string, pageId: string, note?: string) {
  return db().$transaction(async (tx) => {
    const page = await tx.journalPage.findFirst({ where: { id: pageId, ownerId } });
    if (!page) throw notFound("Page");
    const last = await tx.journalPageVersion.findFirst({
      where: { pageId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (last?.version ?? 0) + 1;
    const created = await tx.journalPageVersion.create({
      data: {
        pageId,
        ownerId,
        version,
        title: page.title,
        content: page.content as Prisma.InputJsonValue,
        plainText: page.plainText,
        note: note?.slice(0, 200),
      },
      select: { id: true, version: true, note: true, createdAt: true },
    });
    // Keep the page row's version counter in sync without touching updatedAt semantics for editors.
    await tx.journalPage.update({ where: { id: pageId }, data: { version } });
    return created;
  });
}

export async function listVersions(ownerId: string, pageId: string) {
  const page = await db().journalPage.findFirst({ where: { id: pageId, ownerId }, select: { id: true } });
  if (!page) throw notFound("Page");
  return db().journalPageVersion.findMany({
    where: { pageId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, title: true, note: true, createdAt: true, plainText: true },
  });
}

export async function getVersion(ownerId: string, pageId: string, version: number) {
  const v = await db().journalPageVersion.findFirst({ where: { pageId, version, ownerId } });
  if (!v) throw notFound("Version");
  return { ...v, content: v.content as unknown as TiptapNode };
}

/** Restoring never destroys history: the current state is snapshotted first. */
export async function restoreVersion(ownerId: string, pageId: string, version: number) {
  const target = await getVersion(ownerId, pageId, version);
  await snapshotPage(ownerId, pageId, `Before restoring v${version}`);
  await db().journalPage.update({
    where: { id: pageId },
    data: {
      title: target.title,
      content: target.content as Prisma.InputJsonValue,
      plainText: target.plainText,
    },
  });
  return snapshotPage(ownerId, pageId, `Restored from v${version}`);
}

export async function deletePage(ownerId: string, id: string) {
  const found = await db().journalPage.findFirst({ where: { id, ownerId }, select: { id: true } });
  if (!found) throw notFound("Page");
  await db().journalPage.delete({ where: { id } });
  await forgetEntities(ownerId, "PAGE", [id]);
}

export function normalizeTag(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function setPageTags(ownerId: string, pageId: string, names: string[]) {
  const prisma = db();
  const page = await prisma.journalPage.findFirst({ where: { id: pageId, ownerId }, select: { id: true } });
  if (!page) throw notFound("Page");
  const clean = [...new Set(names.map(normalizeTag).filter(Boolean))].slice(0, 30);
  await prisma.$transaction(async (tx) => {
    const tags = await Promise.all(
      clean.map((name) =>
        tx.tag.upsert({ where: { ownerId_name: { ownerId, name } }, create: { ownerId, name }, update: {} }),
      ),
    );
    await tx.pageTag.deleteMany({ where: { pageId } });
    if (tags.length) await tx.pageTag.createMany({ data: tags.map((t) => ({ pageId, tagId: t.id })) });
  });
  return clean;
}

export async function listTags(ownerId: string) {
  return db().tag.findMany({
    where: { ownerId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { pages: true } } },
  });
}
