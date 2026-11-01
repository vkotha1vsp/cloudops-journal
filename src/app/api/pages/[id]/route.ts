import { route, parseJson } from "@/lib/api";
import { updatePageSchema } from "@/lib/validation";
import { deletePage, getPage, setPageTags, updatePage } from "@/server/pages";

type P = { id: string };

export const GET = route<P>(async ({ user, params }) => ({ page: await getPage(user.id, params.id) }));

/** Autosave endpoint: partial update with optimistic concurrency via expectedUpdatedAt. */
export const PATCH = route<P>(
  async ({ req, user, params }) => {
    const { tags, ...body } = await parseJson(req, updatePageSchema);
    const page = await updatePage(user.id, params.id, body);
    const savedTags = tags ? await setPageTags(user.id, params.id, tags) : undefined;
    return { page, tags: savedTags };
  },
  { limit: 300 },
);

export const DELETE = route<P>(async ({ user, params }) => {
  await deletePage(user.id, params.id);
  return { ok: true };
});
