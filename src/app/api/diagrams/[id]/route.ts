import { route, parseJson } from "@/lib/api";
import { deleteDiagram, diagramInputSchema, getDiagram, saveDiagram } from "@/server/diagrams";

type P = { id: string };

export const GET = route<P>(async ({ user, params }) => ({ diagram: await getDiagram(user.id, params.id) }));

/** Every save creates a new version. */
export const PUT = route<P>(async ({ req, user, params }) => saveDiagram(user.id, params.id, await parseJson(req, diagramInputSchema)), { limit: 60 });

export const DELETE = route<P>(async ({ user, params }) => {
  await deleteDiagram(user.id, params.id);
  return { ok: true };
});
