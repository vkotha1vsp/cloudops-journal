import { route } from "@/lib/api";
import { search, type SearchKind } from "@/server/search";

const KINDS: SearchKind[] = ["page", "topic", "lab", "troubleshooting", "diagram", "tag"];

export const GET = route(
  async ({ req, user }) => {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const kinds = (req.nextUrl.searchParams.get("kinds") ?? "")
      .split(",")
      .filter((k): k is SearchKind => KINDS.includes(k as SearchKind));
    return { results: await search(user.id, q, { kinds, limit: 20 }) };
  },
  { limit: 120 },
);
