import { z } from "zod";
import { tiptapDocSchema } from "@/domain/tiptap";
import { SECTION_KEYS } from "@/domain/topic-sections";

const id = z.string().min(1).max(64);
const title = z.string().trim().min(1, "Title is required").max(200);

export const createPageSchema = z.object({
  title: z.string().trim().max(200).default("Untitled"),
  parentId: id.nullish(),
  topicId: id.nullish(),
  icon: z.string().max(8).nullish(),
  content: tiptapDocSchema.optional(),
});

export const updatePageSchema = z
  .object({
    title: z.string().max(200).optional(),
    content: tiptapDocSchema.optional(),
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
    parentId: id.nullable().optional(),
    topicId: id.nullable().optional(),
    icon: z.string().max(8).nullable().optional(),
    tags: z.array(z.string().max(60)).max(30).optional(),
    expectedUpdatedAt: z.string().datetime().optional(),
  })
  .strict();

export const snapshotSchema = z.object({ note: z.string().trim().max(200).optional() });

export const createCategorySchema = z.object({
  track: z.enum(["AWS", "AZURE", "DEVOPS", "GENERAL"]),
  name: title,
  parentId: id.nullish(),
  description: z.string().max(500).optional(),
});

export const updateCategorySchema = z
  .object({ name: title.optional(), parentId: id.nullable().optional(), description: z.string().max(500).nullable().optional() })
  .strict();

export const createTopicSchema = z.object({ categoryId: id, title, summary: z.string().max(500).optional() });

export const updateTopicSchema = z
  .object({
    title: title.optional(),
    summary: z.string().max(500).nullable().optional(),
    categoryId: id.optional(),
    section: z.object({ key: z.enum(SECTION_KEYS), doc: tiptapDocSchema }).optional(),
  })
  .strict();

export const progressSchema = z.object({
  status: z.enum(["NOT_STARTED", "LEARNING", "REVIEWING", "MASTERED"]),
  confidence: z.number().int().min(0).max(5),
  reviewed: z.boolean().optional(),
});

export const bookmarkSchema = z.object({
  entityType: z.enum(["PAGE", "TOPIC", "DIAGRAM", "LAB", "TROUBLESHOOTING", "CATEGORY"]),
  entityId: id,
});

export const presignSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().max(120),
  sizeBytes: z.number().int().positive(),
  pageId: id.optional(),
});
