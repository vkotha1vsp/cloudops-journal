import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { rateLimit, _resetRateLimits } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/api";
import { HttpError } from "@/lib/errors";

describe("rateLimit", () => {
  beforeEach(() => _resetRateLimits());
  it("allows up to the limit, then blocks until the window resets", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, t0).ok).toBe(true);
    expect(rateLimit("k", 3, 1000, t0 + 10).ok).toBe(false);
    expect(rateLimit("k", 3, 1000, t0 + 1001).ok).toBe(true);
  });
  it("keys are independent", () => {
    expect(rateLimit("a", 1, 1000, 0).ok).toBe(true);
    expect(rateLimit("b", 1, 1000, 0).ok).toBe(true);
  });
});

const req = (method: string, headers: Record<string, string>) =>
  new NextRequest("http://learn.example.com/api/pages", { method, headers: { host: "learn.example.com", ...headers } });

describe("assertSameOrigin (CSRF)", () => {
  it("ignores safe methods", () => {
    expect(() => assertSameOrigin(req("GET", {}))).not.toThrow();
  });
  it("accepts same-origin mutations", () => {
    expect(() => assertSameOrigin(req("POST", { origin: "https://learn.example.com" }))).not.toThrow();
  });
  it("honours x-forwarded-host behind the ALB", () => {
    expect(() =>
      assertSameOrigin(req("PATCH", { origin: "https://learn.example.com", host: "10.0.1.23:3000", "x-forwarded-host": "learn.example.com" })),
    ).not.toThrow();
  });
  it.each<Record<string, string>>([{}, { origin: "https://evil.example" }, { origin: "null" }, { referer: "https://learn.example.com.evil.example/x" }])(
    "rejects %o",
    (h) => {
      expect(() => assertSameOrigin(req("POST", h))).toThrow(HttpError);
    },
  );
});
