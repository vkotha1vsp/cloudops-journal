import { route, parseJson } from "@/lib/api";
import { createTopicSchema } from "@/lib/validation";
import { createTopic } from "@/server/topics";

export const POST = route(async ({ req, user }) => ({ topic: await createTopic(user.id, await parseJson(req, createTopicSchema)) }));
