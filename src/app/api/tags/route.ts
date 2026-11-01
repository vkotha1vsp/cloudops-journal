import { route } from "@/lib/api";
import { listTags } from "@/server/pages";

export const GET = route(async ({ user }) => ({ tags: await listTags(user.id) }));
