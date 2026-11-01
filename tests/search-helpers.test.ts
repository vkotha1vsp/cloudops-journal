import { describe, expect, it } from "vitest";
import { highlightSegments, HL_END, HL_START } from "@/domain/highlight";
import { escapeLike, markSubstring } from "@/server/search";

describe("highlightSegments", () => {
  it("splits marked snippets into text segments (never HTML)", () => {
    const s = `before ${HL_START}ALB${HL_END} middle ${HL_START}health${HL_END}`;
    expect(highlightSegments(s)).toEqual([
      { text: "before ", hit: false },
      { text: "ALB", hit: true },
      { text: " middle ", hit: false },
      { text: "health", hit: true },
    ]);
  });
  it("passes HTML through as plain text", () => {
    expect(highlightSegments("<img src=x onerror=alert(1)>")).toEqual([{ text: "<img src=x onerror=alert(1)>", hit: false }]);
  });
});

describe("escapeLike / markSubstring", () => {
  it("escapes LIKE wildcards", () => {
    expect(escapeLike("100%_done\\")).toBe("100\\%\\_done\\\\");
  });
  it("marks a case-insensitive substring", () => {
    expect(markSubstring("Reason: Target.Timeout", "target.timeout")).toBe(`Reason: ${HL_START}Target.Timeout${HL_END}`);
  });
});
