import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { slugify, uniqueSlug } from "@/domain/slug";
import { labTemplate } from "@/domain/labs/templates";
import { forgetEntities } from "@/server/bookmarks";
import type { Prisma } from "@/generated/prisma/client";

const long = z.string().max(50_000);
const idRef = z.string().max(64).nullish();

export const labStepSchema = z.object({
  title: z.string().trim().min(1).max(300),
  instruction: long.default(""),
  commands: long.default(""),
  expected: long.default(""),
  actual: long.default(""),
  done: z.boolean().default(false),
});

export const checklistItem = z.object({ text: z.string().trim().min(1).max(300), done: z.boolean().default(false) });

export const labUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    objective: long,
    prerequisites: long,
    estimatedCost: z.string().max(500).nullable(),
    expectedResults: long,
    observations: long,
    errorsEncountered: long,
    rootCause: long,
    resolution: long,
    cleanup: long,
    terraform: long,
    checklist: z.array(checklistItem).max(100),
    status: z.enum(["PLANNED", "IN_PROGRESS", "BLOCKED", "COMPLETED"]),
    topicId: idRef,
    diagramId: idRef,
    steps: z.array(labStepSchema).max(100),
  })
  .partial();
export type LabUpdate = z.infer<typeof labUpdateSchema>;

export const labCreateSchema = z.union([
  z.object({ templateId: z.string().max(64), topicId: idRef }).strict(),
  z.object({ title: z.string().trim().min(1).max(200), topicId: idRef }).strict(),
]);

export async function listLabs(ownerId: string, opts: { topicId?: string } = {}) {
  return db().lab.findMany({
    where: { ownerId, ...(opts.topicId ? { topicId: opts.topicId } : {}) },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, title: true, objective: true, status: true, estimatedCost: true, updatedAt: true,
      topic: { select: { id: true, title: true } },
      _count: { select: { steps: true } },
      steps: { select: { done: true } },
    },
  });
}

export async function getLab(ownerId: string, id: string) {
  const lab = await db().lab.findFirst({
    where: { id, ownerId },
    include: {
      steps: { orderBy: { order: "asc" } },
      topic: { select: { id: true, title: true } },
      diagram: { select: { id: true, title: true } },
      cases: { select: { id: true, title: true, area: true } },
      attachments: { where: { uploaded: true }, select: { id: true, fileName: true, mimeType: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!lab) throw notFound("Lab");
  return lab;
}

async function assertRefs(ownerId: string, input: { topicId?: string | null; diagramId?: string | null }) {
  if (input.topicId && !(await db().topic.findFirst({ where: { id: input.topicId, ownerId }, select: { id: true } }))) throw notFound("Topic");
  if (input.diagramId && !(await db().architectureDiagram.findFirst({ where: { id: input.diagramId, ownerId }, select: { id: true } })))
    throw notFound("Diagram");
}

async function slugFor(ownerId: string, title: string) {
  const base = slugify(title);
  const taken = await db().lab.findMany({ where: { ownerId, slug: { startsWith: base } }, select: { slug: true } });
  return uniqueSlug(base, taken.map((t) => t.slug));
}

export async function createLab(ownerId: string, input: z.infer<typeof labCreateSchema>) {
  await assertRefs(ownerId, input);
  if ("templateId" in input) {
    const t = labTemplate(input.templateId);
    if (!t) throw notFound("Lab template");
    return db().lab.create({
      data: {
        ownerId,
        topicId: input.topicId ?? null,
        title: t.title,
        slug: await slugFor(ownerId, t.title),
        objective: t.objective,
        prerequisites: t.prerequisites,
        estimatedCost: t.estimatedCost,
        expectedResults: t.expectedResults,
        cleanup: t.cleanup,
        terraform: t.terraform ?? "",
        checklist: t.checklist.map((text) => ({ text, done: false })),
        steps: { create: t.steps.map((s, i) => ({ order: i + 1, title: s.title, instruction: s.instruction, commands: s.commands ?? "", expected: s.expected ?? "" })) },
      },
      select: { id: true },
    });
  }
  return db().lab.create({
    data: { ownerId, topicId: input.topicId ?? null, title: input.title, slug: await slugFor(ownerId, input.title) },
    select: { id: true },
  });
}

export async function updateLab(ownerId: string, id: string, input: LabUpdate) {
  const current = await db().lab.findFirst({ where: { id, ownerId }, select: { id: true, status: true, startedAt: true, completedAt: true } });
  if (!current) throw notFound("Lab");
  await assertRefs(ownerId, input);
  const { steps, checklist, ...fields } = input;
  const data: Prisma.LabUncheckedUpdateInput = { ...fields };
  if (checklist) data.checklist = checklist as Prisma.InputJsonValue;
  if (input.status && input.status !== current.status) {
    if (input.status === "IN_PROGRESS" && !current.startedAt) data.startedAt = new Date();
    data.completedAt = input.status === "COMPLETED" ? new Date() : null;
  }
  if (steps && steps.length > 100) throw badRequest("Too many steps");
  await db().$transaction(async (tx) => {
    await tx.lab.update({ where: { id }, data });
    if (steps) {
      await tx.labStep.deleteMany({ where: { labId: id } });
      if (steps.length) await tx.labStep.createMany({ data: steps.map((s, i) => ({ ...s, labId: id, order: i + 1 })) });
    }
  });
  return getLab(ownerId, id);
}

export async function deleteLab(ownerId: string, id: string) {
  const res = await db().lab.deleteMany({ where: { id, ownerId } });
  if (!res.count) throw notFound("Lab");
  await forgetEntities(ownerId, "LAB", [id]);
}

/** Labs whose title or topic mentions a term; used to connect labs to troubleshooting cases. */
export async function labOptions(ownerId: string) {
  return db().lab.findMany({ where: { ownerId }, select: { id: true, title: true }, orderBy: { title: "asc" } });
}
