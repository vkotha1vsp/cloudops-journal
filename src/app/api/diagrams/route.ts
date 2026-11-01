import { z } from "zod";
import { route, parseJson } from "@/lib/api";
import { copyConcept, createDiagram, diagramInputSchema, listDiagrams } from "@/server/diagrams";

const body = z.union([z.object({ conceptId: z.string().max(64) }).strict(), diagramInputSchema]);

export const GET = route(async ({ user }) => ({ diagrams: await listDiagrams(user.id) }));

export const POST = route(
  async ({ req, user }) => {
    const input = await parseJson(req, body);
    return "conceptId" in input && !("graph" in input) ? copyConcept(user.id, input.conceptId) : createDiagram(user.id, input as z.infer<typeof diagramInputSchema>);
  },
  { limit: 60 },
);
