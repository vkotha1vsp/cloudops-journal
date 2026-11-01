import { z } from "zod";
import { route, parseJson } from "@/lib/api";
import { setJobDecision } from "@/server/ai";

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const { status } = await parseJson(req, z.object({ status: z.enum(["APPROVED", "REJECTED"]) }));
  await setJobDecision(user.id, params.id, status);
  return { ok: true };
});
