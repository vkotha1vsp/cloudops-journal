import { describe, expect, it } from "vitest";
import { validateUpload } from "@/server/attachments";
import { nextReviewDate, sectionsPlainText } from "@/server/topics";
import { doc, p } from "@/domain/tiptap";
import { TOPIC_SECTIONS } from "@/domain/topic-sections";

describe("validateUpload", () => {
  it("accepts allowed type + matching extension within size", () => {
    expect(() => validateUpload("diagram.png", "image/png", 1024, 25)).not.toThrow();
    expect(() => validateUpload("notes.MD", "text/markdown", 1024, 25)).not.toThrow();
  });
  it.each([
    ["script.html", "text/html", 10, 415],
    ["evil.exe", "application/octet-stream", 10, 415],
    ["image.png.exe", "image/png", 10, 415],
    ["big.pdf", "application/pdf", 26 * 1024 * 1024, 413],
    ["empty.pdf", "application/pdf", 0, 413],
    ["../../etc/passwd.txt", "text/plain", 10, 400],
  ])("rejects %s", (name, type, size, status) => {
    expect(() => validateUpload(name, type, size, 25)).toThrow(expect.objectContaining({ status }));
  });
});

describe("topics", () => {
  it("has exactly the 18 sections from the spec", () => {
    expect(TOPIC_SECTIONS).toHaveLength(18);
    expect(new Set(TOPIC_SECTIONS.map((s) => s.key)).size).toBe(18);
  });
  it("review interval grows with confidence", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const days = [0, 1, 2, 3, 4, 5].map((c) => (nextReviewDate(c, from).getTime() - from.getTime()) / 86_400_000);
    expect(days).toEqual([1, 2, 4, 7, 14, 30]);
    expect(nextReviewDate(99, from).getTime()).toBe(nextReviewDate(5, from).getTime());
  });
  it("indexes section text but not the history log", () => {
    const text = sectionsPlainText({ concept: doc(p("layer 7")), cli: doc(p("aws elbv2")), history: [{ at: "x", section: "cli", chars: 9 }] });
    expect(text).toBe("layer 7\n\naws elbv2");
  });
});
