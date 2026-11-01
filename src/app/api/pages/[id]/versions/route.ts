import { route, parseJson } from "@/lib/api";
import { snapshotSchema } from "@/lib/validation";
import { listVersions, snapshotPage } from "@/server/pages";

type P = { id: string };

export const GET = route<P>(async ({ user, params }) => ({ versions: await listVersions(user.id, params.id) }));

export const POST = route<P>(async ({ req, user, params }) => {
  const { note } = await parseJson(req, snapshotSchema);
  return { version: await snapshotPage(user.id, params.id, note ?? "Saved version") };
});
