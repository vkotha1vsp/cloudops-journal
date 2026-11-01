import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { slugify, uniqueSlug } from "@/domain/slug";
import type { Track } from "@/generated/prisma/enums";
import { forgetEntities } from "@/server/bookmarks";

export type TreeCategory = {
  id: string;
  name: string;
  icon: string | null;
  parentId: string | null;
  children: TreeCategory[];
  topics: { id: string; title: string; status: string; confidence: number }[];
};

export async function getTree(ownerId: string, track: Track): Promise<TreeCategory[]> {
  const prisma = db();
  const [cats, topics] = await Promise.all([
    prisma.category.findMany({ where: { ownerId, track }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.topic.findMany({
      where: { ownerId, category: { track } },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      select: { id: true, title: true, categoryId: true, progress: { where: { ownerId }, select: { status: true, confidence: true } } },
    }),
  ]);
  const byId = new Map<string, TreeCategory>();
  for (const c of cats) byId.set(c.id, { id: c.id, name: c.name, icon: c.icon, parentId: c.parentId, children: [], topics: [] });
  for (const t of topics) {
    byId.get(t.categoryId)?.topics.push({
      id: t.id,
      title: t.title,
      status: t.progress[0]?.status ?? "NOT_STARTED",
      confidence: t.progress[0]?.confidence ?? 0,
    });
  }
  const roots: TreeCategory[] = [];
  for (const c of byId.values()) {
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    if (parent) parent.children.push(c);
    else roots.push(c);
  }
  return roots;
}

async function ownedCategory(ownerId: string, id: string) {
  const cat = await db().category.findFirst({ where: { id, ownerId } });
  if (!cat) throw notFound("Category");
  return cat;
}

export async function createCategory(ownerId: string, input: { track: Track; name: string; parentId?: string | null; description?: string }) {
  const prisma = db();
  if (input.parentId) {
    const parent = await ownedCategory(ownerId, input.parentId);
    if (parent.track !== input.track) throw badRequest("Parent category belongs to a different track");
  }
  const siblings = await prisma.category.findMany({
    where: { ownerId, track: input.track, parentId: input.parentId ?? null },
    select: { slug: true },
  });
  return prisma.category.create({
    data: {
      ownerId,
      track: input.track,
      parentId: input.parentId ?? null,
      name: input.name.trim(),
      description: input.description,
      slug: uniqueSlug(slugify(input.name), siblings.map((s) => s.slug)),
      sortOrder: siblings.length,
    },
  });
}

export async function updateCategory(ownerId: string, id: string, input: { name?: string; parentId?: string | null; description?: string | null }) {
  const cat = await ownedCategory(ownerId, id);
  if (input.parentId !== undefined && input.parentId !== null) {
    if (input.parentId === id) throw badRequest("A category cannot be its own parent");
    const parent = await ownedCategory(ownerId, input.parentId);
    if (parent.track !== cat.track) throw badRequest("Cannot move across tracks");
    // Reject cycles: walk up from the new parent.
    let cursor: string | null = parent.parentId;
    while (cursor) {
      if (cursor === id) throw badRequest("That move would create a cycle");
      const next: { parentId: string | null } | null = await db().category.findFirst({ where: { id: cursor, ownerId }, select: { parentId: true } });
      cursor = next?.parentId ?? null;
    }
  }
  return db().category.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      description: input.description,
      parentId: input.parentId,
    },
  });
}

export async function deleteCategory(ownerId: string, id: string) {
  const root = await ownedCategory(ownerId, id);
  // Collect the subtree first so bookmarks / recent views for cascaded rows can be cleaned up.
  const all = await db().category.findMany({ where: { ownerId, track: root.track }, select: { id: true, parentId: true } });
  const ids = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const c of all) if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) { ids.add(c.id); grew = true; }
  }
  const topics = await db().topic.findMany({ where: { ownerId, categoryId: { in: [...ids] } }, select: { id: true } });
  await db().category.delete({ where: { id } });
  await forgetEntities(ownerId, "CATEGORY", [...ids]);
  await forgetEntities(ownerId, "TOPIC", topics.map((t) => t.id));
}
