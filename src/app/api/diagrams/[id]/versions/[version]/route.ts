import { route } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { getDiagramVersion } from "@/server/diagrams";

export const GET = route<{ id: string; version: string }>(async ({ user, params }) => {
  const v = Number(params.version);
  if (!Number.isInteger(v) || v < 1) throw badRequest("Invalid version");
  return { version: await getDiagramVersion(user.id, params.id, v) };
});
