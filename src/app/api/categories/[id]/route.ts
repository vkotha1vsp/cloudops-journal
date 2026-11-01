import { route, parseJson } from "@/lib/api";
import { updateCategorySchema } from "@/lib/validation";
import { deleteCategory, updateCategory } from "@/server/categories";

type P = { id: string };

export const PATCH = route<P>(async ({ req, user, params }) => ({
  category: await updateCategory(user.id, params.id, await parseJson(req, updateCategorySchema)),
}));

export const DELETE = route<P>(async ({ user, params }) => {
  await deleteCategory(user.id, params.id);
  return { ok: true };
});
