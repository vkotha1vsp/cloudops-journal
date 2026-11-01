import { route, parseJson } from "@/lib/api";
import { caseSchema, createCase, listCases } from "@/server/cases";

export const GET = route(async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  return { cases: await listCases(user.id, { area: sp.get("area") ?? undefined, q: sp.get("q") ?? undefined }) };
});

export const POST = route(async ({ req, user }) => createCase(user.id, await parseJson(req, caseSchema)), { limit: 30 });
