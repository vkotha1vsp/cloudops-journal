import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { RELATIONS, validateGraph, type ArchGraph } from "@/domain/architecture/graph";
import { buildAllScenarios } from "@/domain/architecture/scenarios";
import { diagramDocument } from "@/domain/architecture/document";
import { conceptGraph } from "@/domain/architecture/library";
import { createPage } from "@/server/pages";
import { forgetEntities } from "@/server/bookmarks";
import type { Prisma } from "@/generated/prisma/client";

const key = z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/);
const text = (max: number) => z.string().max(max);

export const graphSchema = z.object({
  boundaries: z
    .array(
      z.object({
        id: key,
        kind: z.enum(["region", "vpc", "az", "subnet-public", "subnet-private"]),
        label: text(120),
        parentId: key.optional(),
      }),
    )
    .max(80),
  nodes: z
    .array(
      z.object({
        key,
        kind: z.string().regex(/^[a-z0-9-]{1,40}$/),
        role: z.enum(["traffic", "config", "boundary-member"]),
        label: text(160),
        boundaryId: key.optional(),
        config: z.record(z.unknown()).optional(),
        x: z.number().finite().optional(),
        y: z.number().finite().optional(),
      }),
    )
    .max(250),
  edges: z
    .array(
      z.object({
        key,
        source: key,
        target: key,
        relation: z.enum(RELATIONS as [string, ...string[]]),
        protocol: text(24).optional(),
        port: z.number().int().min(0).max(65535).optional(),
        label: text(200).optional(),
      }),
    )
    .max(500),
});

export const diagramInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  provider: z.enum(["aws", "azure"]).default("aws"),
  topicId: z.string().max(64).nullish(),
  graph: graphSchema,
  note: z.string().max(200).optional(),
  assumptions: z.array(z.string().max(500)).max(30).optional(),
  expectedVersion: z.number().int().positive().optional(),
});
export type DiagramInput = z.infer<typeof diagramInputSchema>;

function checkIntegrity(g: ArchGraph) {
  const keys = new Set<string>();
  for (const n of g.nodes) {
    if (keys.has(n.key)) throw badRequest(`Duplicate resource key ${n.key}`);
    keys.add(n.key);
  }
  for (const e of g.edges) if (!keys.has(e.source) || !keys.has(e.target)) throw badRequest(`Connection ${e.key} points at a missing resource`);
}

async function writeGraph(tx: Prisma.TransactionClient, diagramId: string, g: ArchGraph) {
  await tx.architectureEdge.deleteMany({ where: { diagramId } });
  await tx.architectureNode.deleteMany({ where: { diagramId } });
  await tx.animationScenario.deleteMany({ where: { diagramId } });
  const ids = new Map<string, string>();
  for (const n of g.nodes) {
    const row = await tx.architectureNode.create({
      data: {
        diagramId, key: n.key, kind: n.kind, role: n.role, label: n.label, boundaryId: n.boundaryId,
        config: (n.config ?? {}) as Prisma.InputJsonValue, positionX: n.x ?? 0, positionY: n.y ?? 0,
      },
      select: { id: true },
    });
    ids.set(n.key, row.id);
  }
  if (g.edges.length)
    await tx.architectureEdge.createMany({
      data: g.edges.map((e) => ({
        diagramId, key: e.key, sourceId: ids.get(e.source)!, targetId: ids.get(e.target)!, relation: e.relation,
        protocol: e.protocol, port: e.port, label: e.label,
      })),
    });
  for (const s of buildAllScenarios(g).filter((x) => x.applicable)) {
    await tx.animationScenario.create({
      data: {
        diagramId, mode: s.mode, title: s.title, description: s.description,
        steps: {
          create: s.steps.map((st) => ({
            order: st.order, title: st.title, explanation: st.explanation, nodeKeys: st.nodeKeys, edgeKeys: st.edgeKeys,
            outcome: st.outcome, durationMs: st.durationMs,
          })),
        },
      },
    });
  }
}

export async function listDiagrams(ownerId: string) {
  return db().architectureDiagram.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, description: true, provider: true, currentVersion: true, updatedAt: true, topic: { select: { id: true, title: true } }, _count: { select: { nodes: true } } },
  });
}

export async function getDiagram(ownerId: string, id: string) {
  const d = await db().architectureDiagram.findFirst({
    where: { id, ownerId },
    include: {
      nodes: true,
      edges: { include: { source: { select: { key: true } }, target: { select: { key: true } } } },
      versions: { orderBy: { version: "desc" }, select: { version: true, note: true, createdAt: true } },
      topic: { select: { id: true, title: true, category: { select: { track: true } } } },
      pages: { select: { id: true, title: true } },
    },
  });
  if (!d) throw notFound("Diagram");
  const layout = (d.layout ?? {}) as { boundaries?: ArchGraph["boundaries"]; assumptions?: string[] };
  const graph: ArchGraph = {
    boundaries: layout.boundaries ?? [],
    nodes: d.nodes.map((n) => ({
      key: n.key, kind: n.kind, role: n.role as ArchGraph["nodes"][number]["role"], label: n.label, boundaryId: n.boundaryId ?? undefined,
      config: (n.config ?? {}) as Record<string, unknown>, x: n.positionX, y: n.positionY,
    })),
    edges: d.edges.map((e) => ({
      key: e.key, source: e.source.key, target: e.target.key, relation: e.relation, protocol: e.protocol ?? undefined, port: e.port ?? undefined, label: e.label ?? undefined,
    })),
  };
  return {
    id: d.id, title: d.title, description: d.description, provider: d.provider as "aws" | "azure", currentVersion: d.currentVersion,
    updatedAt: d.updatedAt, topic: d.topic, pages: d.pages, versions: d.versions, assumptions: layout.assumptions ?? [], graph,
  };
}

async function assertTopic(ownerId: string, topicId?: string | null) {
  if (!topicId) return;
  const t = await db().topic.findFirst({ where: { id: topicId, ownerId }, select: { id: true } });
  if (!t) throw notFound("Topic");
}

export async function createDiagram(ownerId: string, input: DiagramInput) {
  checkIntegrity(input.graph);
  await assertTopic(ownerId, input.topicId);
  const validation = validateGraph(input.graph);
  return db().$transaction(
    async (tx) => {
      const d = await tx.architectureDiagram.create({
        data: {
          ownerId, title: input.title, description: input.description, provider: input.provider, topicId: input.topicId ?? null, currentVersion: 1,
          layout: { boundaries: input.graph.boundaries, assumptions: input.assumptions ?? [], validation } as unknown as Prisma.InputJsonValue,
        },
      });
      await writeGraph(tx, d.id, input.graph);
      await tx.architectureDiagramVersion.create({ data: { diagramId: d.id, version: 1, graph: input.graph as unknown as Prisma.InputJsonValue, note: input.note ?? "Created" } });
      return { id: d.id, version: 1 };
    },
    { timeout: 30_000 },
  );
}

/** Saving always creates a new version (scenario D); the previous one stays restorable. */
export async function saveDiagram(ownerId: string, id: string, input: DiagramInput) {
  checkIntegrity(input.graph);
  await assertTopic(ownerId, input.topicId);
  const current = await db().architectureDiagram.findFirst({ where: { id, ownerId }, select: { currentVersion: true } });
  if (!current) throw notFound("Diagram");
  if (input.expectedVersion && input.expectedVersion !== current.currentVersion)
    throw conflict(`This diagram was saved elsewhere (now version ${current.currentVersion}). Reload to see it.`);
  const validation = validateGraph(input.graph);
  const version = current.currentVersion + 1;
  await db().$transaction(
    async (tx) => {
      await tx.architectureDiagram.update({
        where: { id },
        data: {
          title: input.title, description: input.description, provider: input.provider, topicId: input.topicId ?? null, currentVersion: version,
          layout: { boundaries: input.graph.boundaries, assumptions: input.assumptions ?? [], validation } as unknown as Prisma.InputJsonValue,
        },
      });
      await writeGraph(tx, id, input.graph);
      await tx.architectureDiagramVersion.create({ data: { diagramId: id, version, graph: input.graph as unknown as Prisma.InputJsonValue, note: input.note ?? `Version ${version}` } });
    },
    { timeout: 30_000 },
  );
  return { id, version };
}

export async function getDiagramVersion(ownerId: string, id: string, version: number) {
  const d = await db().architectureDiagram.findFirst({ where: { id, ownerId }, select: { id: true } });
  if (!d) throw notFound("Diagram");
  const v = await db().architectureDiagramVersion.findUnique({ where: { diagramId_version: { diagramId: id, version } } });
  if (!v) throw notFound("Version");
  return { version: v.version, note: v.note, createdAt: v.createdAt, graph: graphSchema.parse(v.graph) };
}

export async function deleteDiagram(ownerId: string, id: string) {
  const d = await db().architectureDiagram.findFirst({ where: { id, ownerId }, select: { id: true } });
  if (!d) throw notFound("Diagram");
  await db().architectureDiagram.delete({ where: { id } });
  await forgetEntities(ownerId, "DIAGRAM", [id]);
}

/** Scenario C: the diagram plus generated explanation as a new journal page, linked to a learning topic. */
export async function saveDiagramAsPage(ownerId: string, id: string, input: { topicId?: string | null; title?: string }) {
  const d = await getDiagram(ownerId, id);
  await assertTopic(ownerId, input.topicId);
  const content = diagramDocument({ graph: d.graph, title: d.title, summary: d.description ?? undefined, diagramId: d.id, assumptions: d.assumptions });
  const page = await createPage(ownerId, { title: input.title?.trim() || d.title, topicId: input.topicId ?? d.topic?.id ?? null, content, icon: "🏗️" });
  await db().journalPage.update({ where: { id: page.id }, data: { diagrams: { connect: { id: d.id } }, metadata: { source: "architecture-studio", diagramId: d.id, diagramVersion: d.currentVersion } } });
  if (input.topicId && !d.topic) await db().architectureDiagram.update({ where: { id: d.id }, data: { topicId: input.topicId } });
  return page;
}

/** Copy a concept-library diagram into the user's own diagrams. */
export async function copyConcept(ownerId: string, conceptId: string) {
  const c = conceptGraph(conceptId);
  if (!c) throw notFound("Concept");
  return createDiagram(ownerId, {
    title: c.concept.title, description: c.concept.summary, provider: c.concept.provider, graph: c.graph, assumptions: c.assumptions, note: `Copied from concept “${c.concept.title}”`,
  });
}
