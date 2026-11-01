import { route, parseJson } from "@/lib/api";
import { progressSchema } from "@/lib/validation";
import { setProgress } from "@/server/topics";

export const PUT = route<{ id: string }>(async ({ req, user, params }) => ({
  progress: await setProgress(user.id, params.id, await parseJson(req, progressSchema)),
}));
