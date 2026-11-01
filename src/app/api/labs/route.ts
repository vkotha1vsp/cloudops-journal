import { route, parseJson } from "@/lib/api";
import { createLab, labCreateSchema, listLabs } from "@/server/labs";

export const GET = route(async ({ req, user }) => ({ labs: await listLabs(user.id, { topicId: req.nextUrl.searchParams.get("topic") ?? undefined }) }));

export const POST = route(async ({ req, user }) => createLab(user.id, await parseJson(req, labCreateSchema)), { limit: 30 });
