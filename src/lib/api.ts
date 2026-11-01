import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type z } from "zod";
import { requireApiUser, type CurrentUser } from "@/lib/auth";
import { HttpError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";

type Ctx<P> = { params: Promise<P> };
type Handler<P> = (args: { req: NextRequest; user: CurrentUser; params: P }) => Promise<unknown>;

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF defence for cookie-authenticated JSON APIs: mutating requests must come from our own
 * origin (Origin header, falling back to Referer). Combined with SameSite=Lax session cookies
 * and JSON-only bodies, cross-site form posts cannot reach these handlers.
 */
export function assertSameOrigin(req: NextRequest) {
  if (!MUTATING.has(req.method)) return;
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) throw new HttpError(403, "Missing origin");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Invalid origin");
  }
  if (originHost !== host) throw new HttpError(403, "Cross-origin request rejected");
}

export function route<P = Record<string, never>>(
  handler: Handler<P>,
  opts: { limit?: number; windowMs?: number } = {},
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      assertSameOrigin(req);
      const user = await requireApiUser();
      const limit = opts.limit ?? (MUTATING.has(req.method) ? 120 : 600);
      const rl = rateLimit(`${user.id}:${req.method}:${req.nextUrl.pathname}`, limit, opts.windowMs ?? 60_000);
      if (!rl.ok) {
        return NextResponse.json(
          { error: "Too many requests" },
          { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
        );
      }
      const params = (await ctx.params) ?? ({} as P);
      const result = await handler({ req, user, params });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
  }
  if (isPrismaKnown(err, "P2002")) {
    return NextResponse.json({ error: "An item with that name already exists" }, { status: 409 });
  }
  if (isPrismaKnown(err, "P2025")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

function isPrismaKnown(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === code;
}

const MAX_JSON_BYTES = 2 * 1024 * 1024;

export async function parseJson<S extends z.ZodTypeAny>(req: NextRequest, schema: S): Promise<z.output<S>> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw new HttpError(415, "Expected application/json");
  const text = await req.text();
  if (text.length > MAX_JSON_BYTES) throw new HttpError(413, "Request body too large");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Malformed JSON");
  }
  return schema.parse(body);
}
