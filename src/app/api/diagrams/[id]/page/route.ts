import { z } from "zod";
import { route, parseJson } from "@/lib/api";
import { saveDiagramAsPage } from "@/server/diagrams";

const body = z.object({ topicId: z.string().max(64).nullish(), title: z.string().max(200).optional() });

export const POST = route<{ id: string }>(async ({ req, user, params }) => ({ page: await saveDiagramAsPage(user.id, params.id, await parseJson(req, body)) }));
