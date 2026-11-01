import { route, parseJson } from "@/lib/api";
import { bookmarkSchema } from "@/lib/validation";
import { listBookmarks, toggleBookmark } from "@/server/bookmarks";

export const GET = route(async ({ user }) => ({ bookmarks: await listBookmarks(user.id) }));

export const POST = route(async ({ req, user }) => {
  const { entityType, entityId } = await parseJson(req, bookmarkSchema);
  return toggleBookmark(user.id, entityType, entityId);
});
