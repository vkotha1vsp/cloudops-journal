import { route, parseJson } from "@/lib/api";
import { updateTopicSchema } from "@/lib/validation";
import { deleteTopic, getTopic, updateTopic } from "@/server/topics";

type P = { id: string };

export const GET = route<P>(async ({ user, params }) => ({ topic: await getTopic(user.id, params.id) }));

export const PATCH = route<P>(
  async ({ req, user, params }) => {
    const t = await updateTopic(user.id, params.id, await parseJson(req, updateTopicSchema));
    return { topic: { id: t.id, title: t.title, summary: t.summary, updatedAt: t.updatedAt } };
  },
  { limit: 300 },
);

export const DELETE = route<P>(async ({ user, params }) => {
  await deleteTopic(user.id, params.id);
  return { ok: true };
});
