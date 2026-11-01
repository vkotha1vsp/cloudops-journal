import { route, parseJson } from "@/lib/api";
import { caseSchema, deleteCase, getCase, updateCase } from "@/server/cases";

type P = { id: string };

export const GET = route<P>(async ({ user, params }) => ({ case: await getCase(user.id, params.id) }));

export const PUT = route<P>(async ({ req, user, params }) => ({ case: await updateCase(user.id, params.id, await parseJson(req, caseSchema)) }));

export const DELETE = route<P>(async ({ user, params }) => {
  await deleteCase(user.id, params.id);
  return { ok: true };
});
