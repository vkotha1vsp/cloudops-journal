import { z } from "zod";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { forgetEntities } from "@/server/bookmarks";

export const CASE_AREAS = ["aws", "azure", "kubernetes", "docker", "jenkins", "terraform", "networking", "security"] as const;

const long = z.string().max(50_000);
export const caseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  errorMessage: long.default(""),
  area: z.enum(CASE_AREAS),
  services: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  symptoms: long.default(""),
  rootCause: long.default(""),
  investigation: long.default(""),
  resolution: long.default(""),
  verification: long.default(""),
  prevention: long.default(""),
  labIds: z.array(z.string().max(64)).max(50).default([]),
  diagramIds: z.array(z.string().max(64)).max(50).default([]),
});
export type CaseInput = z.infer<typeof caseSchema>;

export async function listCases(ownerId: string, opts: { area?: string; q?: string } = {}) {
  const q = opts.q?.trim();
  return db().troubleshootingCase.findMany({
    where: {
      ownerId,
      ...(opts.area && (CASE_AREAS as readonly string[]).includes(opts.area) ? { area: opts.area } : {}),
      ...(q
        ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { errorMessage: { contains: q, mode: "insensitive" } }, { investigation: { contains: q, mode: "insensitive" } }, { services: { has: q } }] }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, area: true, services: true, errorMessage: true, updatedAt: true, _count: { select: { labs: true, diagrams: true } } },
  });
}

export async function getCase(ownerId: string, id: string) {
  const c = await db().troubleshootingCase.findFirst({
    where: { id, ownerId },
    include: { labs: { select: { id: true, title: true, status: true } }, diagrams: { select: { id: true, title: true, provider: true } } },
  });
  if (!c) throw notFound("Troubleshooting case");
  return c;
}

async function ownedIds(ownerId: string, labIds: string[], diagramIds: string[]) {
  const [labs, diagrams] = await Promise.all([
    labIds.length ? db().lab.findMany({ where: { ownerId, id: { in: labIds } }, select: { id: true } }) : [],
    diagramIds.length ? db().architectureDiagram.findMany({ where: { ownerId, id: { in: diagramIds } }, select: { id: true } }) : [],
  ]);
  if (labs.length !== new Set(labIds).size) throw notFound("Lab");
  if (diagrams.length !== new Set(diagramIds).size) throw notFound("Diagram");
  return { labs: labs.map((l) => ({ id: l.id })), diagrams: diagrams.map((d) => ({ id: d.id })) };
}

export async function createCase(ownerId: string, input: CaseInput) {
  const { labIds, diagramIds, ...fields } = input;
  const links = await ownedIds(ownerId, labIds, diagramIds);
  return db().troubleshootingCase.create({
    data: { ...fields, ownerId, labs: { connect: links.labs }, diagrams: { connect: links.diagrams } },
    select: { id: true },
  });
}

export async function updateCase(ownerId: string, id: string, input: CaseInput) {
  const existing = await db().troubleshootingCase.findFirst({ where: { id, ownerId }, select: { id: true } });
  if (!existing) throw notFound("Troubleshooting case");
  const { labIds, diagramIds, ...fields } = input;
  const links = await ownedIds(ownerId, labIds, diagramIds);
  await db().troubleshootingCase.update({ where: { id }, data: { ...fields, labs: { set: links.labs }, diagrams: { set: links.diagrams } } });
  return getCase(ownerId, id);
}

export async function deleteCase(ownerId: string, id: string) {
  const res = await db().troubleshootingCase.deleteMany({ where: { id, ownerId } });
  if (!res.count) throw notFound("Troubleshooting case");
  await forgetEntities(ownerId, "TROUBLESHOOTING", [id]);
}
