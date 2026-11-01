import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { slugify, uniqueSlug } from "@/domain/slug";
import { extractText, type TiptapNode } from "@/domain/tiptap";
import { EDITABLE_SECTIONS, type SectionKey } from "@/domain/topic-sections";
import type { ProgressStatus } from "@/generated/prisma/enums";
import { forgetEntities } from "@/server/bookmarks";

export type HistoryEntry = { at: string; section: SectionKey | "title" | "summary"; chars: number };
type ContentKey = Exclude<SectionKey, "history">;
export type TopicSections = Partial<Record<ContentKey, TiptapNode>> & { history?: HistoryEntry[] };

const MAX_HISTORY = 200;

export function sectionsPlainText(sections: TopicSections): string {
  return EDITABLE_SECTIONS.map((s) => extractText(sections[s.key as ContentKey]))
    .filter(Boolean)
    .join("\n\n");
}

export async function getTopic(ownerId: string, id: string) {
  const topic = await db().topic.findFirst({
    where: { id, ownerId },
    include: {
      category: { select: { id: true, name: true, track: true, parent: { select: { name: true } } } },
      progress: { where: { ownerId } },
      pages: { select: { id: true, title: true, updatedAt: true, status: true }, orderBy: { updatedAt: "desc" } },
      references: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!topic) throw notFound("Topic");
  return { ...topic, sections: (topic.sections ?? {}) as TopicSections };
}

export async function createTopic(ownerId: string, input: { categoryId: string; title: string; summary?: string }) {
  const prisma = db();
  const category = await prisma.category.findFirst({ where: { id: input.categoryId, ownerId } });
  if (!category) throw notFound("Category");
  const siblings = await prisma.topic.findMany({ where: { categoryId: category.id }, select: { slug: true } });
  return prisma.topic.create({
    data: {
      ownerId,
      categoryId: category.id,
      title: input.title.trim(),
      summary: input.summary,
      slug: uniqueSlug(slugify(input.title), siblings.map((s) => s.slug)),
      sortOrder: siblings.length,
    },
  });
}

export async function updateTopic(
  ownerId: string,
  id: string,
  input: { title?: string; summary?: string | null; categoryId?: string; section?: { key: SectionKey; doc: TiptapNode } },
) {
  const prisma = db();
  const topic = await prisma.topic.findFirst({ where: { id, ownerId } });
  if (!topic) throw notFound("Topic");
  if (input.section?.key === "history") throw badRequest("Revision history is generated automatically");
  if (input.categoryId) {
    const target = await prisma.category.findFirst({ where: { id: input.categoryId, ownerId } });
    if (!target) throw notFound("Category");
  }

  const sections = { ...((topic.sections ?? {}) as TopicSections) };
  const history = [...(sections.history ?? [])];
  const now = new Date().toISOString();

  if (input.section) {
    sections[input.section.key as ContentKey] = input.section.doc;
    const chars = extractText(input.section.doc).length;
    // Collapse rapid autosaves of the same section into one entry (5-minute window).
    const last = history[history.length - 1];
    if (last && last.section === input.section.key && Date.now() - Date.parse(last.at) < 5 * 60_000) {
      history[history.length - 1] = { at: now, section: input.section.key, chars };
    } else {
      history.push({ at: now, section: input.section.key, chars });
    }
  }
  if (input.title && input.title !== topic.title) history.push({ at: now, section: "title", chars: input.title.length });
  if (input.summary !== undefined && input.summary !== topic.summary) history.push({ at: now, section: "summary", chars: input.summary?.length ?? 0 });
  sections.history = history.slice(-MAX_HISTORY);

  return prisma.topic.update({
    where: { id },
    data: {
      title: input.title?.trim(),
      summary: input.summary,
      categoryId: input.categoryId,
      sections: sections as object,
      plainText: sectionsPlainText(sections),
    },
  });
}

export async function deleteTopic(ownerId: string, id: string) {
  const found = await db().topic.findFirst({ where: { id, ownerId }, select: { id: true } });
  if (!found) throw notFound("Topic");
  await db().topic.delete({ where: { id } });
  await forgetEntities(ownerId, "TOPIC", [id]);
}

/** Spaced review: next review interval grows with confidence (0–5). */
export function nextReviewDate(confidence: number, from = new Date()): Date {
  const days = [1, 2, 4, 7, 14, 30][Math.max(0, Math.min(5, confidence))]!;
  return new Date(from.getTime() + days * 86_400_000);
}

export async function setProgress(ownerId: string, topicId: string, input: { status: ProgressStatus; confidence: number; reviewed?: boolean }) {
  const topic = await db().topic.findFirst({ where: { id: topicId, ownerId }, select: { id: true } });
  if (!topic) throw notFound("Topic");
  const now = new Date();
  const schedule =
    input.status === "NOT_STARTED"
      ? { nextReviewAt: null }
      : { nextReviewAt: nextReviewDate(input.confidence, now), ...(input.reviewed ? { lastReviewAt: now } : {}) };
  return db().learningProgress.upsert({
    where: { ownerId_topicId: { ownerId, topicId } },
    create: { ownerId, topicId, status: input.status, confidence: input.confidence, ...schedule },
    update: { status: input.status, confidence: input.confidence, ...schedule },
  });
}
