import { route, parseJson } from "@/lib/api";
import { ask, askSchema } from "@/server/ai";

/** AI output is returned for review only. Nothing it suggests is executed or saved automatically. */
export const POST = route(async ({ req, user }) => ask(user.id, await parseJson(req, askSchema)), { limit: 10 });
