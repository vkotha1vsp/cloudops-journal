import { route, parseJson } from "@/lib/api";
import { createPageSchema } from "@/lib/validation";
import { createPage, listPages } from "@/server/pages";

export const GET = route(async ({ user }) => ({ pages: await listPages(user.id) }));

export const POST = route(async ({ req, user }) => {
  const body = await parseJson(req, createPageSchema);
  return { page: await createPage(user.id, body) };
});
