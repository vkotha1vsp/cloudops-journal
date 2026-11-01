import { route } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { getVersion, restoreVersion } from "@/server/pages";

type P = { id: string; version: string };

function parseVersion(v: string) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw badRequest("Invalid version");
  return n;
}

export const GET = route<P>(async ({ user, params }) => ({ version: await getVersion(user.id, params.id, parseVersion(params.version)) }));

/** POST restores this version (after snapshotting the current state). */
export const POST = route<P>(async ({ user, params }) => ({ restored: await restoreVersion(user.id, params.id, parseVersion(params.version)) }));
