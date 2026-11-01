import { route, parseJson } from "@/lib/api";
import { deleteLab, getLab, labUpdateSchema, updateLab } from "@/server/labs";

type P = { id: string };

export const GET = route<P>(async ({ user, params }) => ({ lab: await getLab(user.id, params.id) }));

export const PATCH = route<P>(async ({ req, user, params }) => ({ lab: await updateLab(user.id, params.id, await parseJson(req, labUpdateSchema)) }));

export const DELETE = route<P>(async ({ user, params }) => {
  await deleteLab(user.id, params.id);
  return { ok: true };
});
