import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "@/domain/slug";
import { isSafeHref } from "@/domain/links";
import { normalizeTag } from "@/server/pages";

describe("slugify", () => {
  it("produces URL-safe slugs", () => {
    expect(slugify("Route 53 & ACM: Failover!")).toBe("route-53-and-acm-failover");
    expect(slugify("Ümlaut Ça va")).toBe("umlaut-ca-va");
    expect(slugify("   ")).toBe("untitled");
  });
  it("de-duplicates", () => {
    expect(uniqueSlug("vpc", ["vpc", "vpc-2"])).toBe("vpc-3");
    expect(uniqueSlug("vpc", [])).toBe("vpc");
  });
});

describe("isSafeHref", () => {
  it.each(["https://docs.aws.amazon.com/", "http://localhost:3000/x", "/journal/abc", "mailto:me@example.com"])("allows %s", (u) => {
    expect(isSafeHref(u)).toBe(true);
  });
  it.each(["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html;base64,xx", "//evil.example", "/\\evil.example", "vbscript:x", "https://", "java\nscript:x"])(
    "blocks %s",
    (u) => {
      expect(isSafeHref(u)).toBe(false);
    },
  );
});

describe("normalizeTag", () => {
  it("lowercases and strips #", () => {
    expect(normalizeTag("#Health Check")).toBe("health-check");
    expect(normalizeTag("  ECS  ")).toBe("ecs");
    expect(normalizeTag("<b>x</b>")).toBe("b-x-b");
  });
});
