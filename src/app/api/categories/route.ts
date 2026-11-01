import { route, parseJson } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { createCategorySchema } from "@/lib/validation";
import { createCategory, getTree } from "@/server/categories";

const TRACKS = ["AWS", "AZURE", "DEVOPS", "GENERAL"] as const;

export const GET = route(async ({ req, user }) => {
  const track = req.nextUrl.searchParams.get("track") ?? "AWS";
  if (!TRACKS.includes(track as (typeof TRACKS)[number])) throw badRequest("Unknown track");
  return { tree: await getTree(user.id, track as (typeof TRACKS)[number]) };
});

export const POST = route(async ({ req, user }) => ({ category: await createCategory(user.id, await parseJson(req, createCategorySchema)) }));
