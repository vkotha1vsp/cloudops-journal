import { describe, expect, it } from "vitest";
import { bullets, code, doc, extractText, h, p, preview, tiptapDocSchema } from "@/domain/tiptap";

describe("extractText", () => {
  it("flattens headings, paragraphs and lists with line breaks", () => {
    const text = extractText(doc(h(2, "Root cause"), p("Health check path changed."), bullets("one", "two")));
    expect(text).toBe("Root cause\nHealth check path changed.\none\ntwo");
  });

  it("keeps code blocks verbatim so CLI commands are searchable", () => {
    expect(extractText(doc(code("bash", "aws elbv2 describe-target-health --target-group-arn $TG")))).toContain(
      "aws elbv2 describe-target-health --target-group-arn $TG",
    );
  });

  it("handles empty and missing documents", () => {
    expect(extractText(doc())).toBe("");
    expect(extractText(undefined)).toBe("");
  });
});

describe("tiptapDocSchema", () => {
  it("accepts a valid document", () => {
    expect(tiptapDocSchema.safeParse(doc(p("hi"))).success).toBe(true);
  });
  it("rejects a non-doc root", () => {
    expect(tiptapDocSchema.safeParse(p("hi")).success).toBe(false);
  });
  it("rejects unknown keys and suspicious node type names", () => {
    expect(tiptapDocSchema.safeParse({ type: "doc", onclick: "x" }).success).toBe(false);
    expect(tiptapDocSchema.safeParse({ type: "doc", content: [{ type: "<script>" }] }).success).toBe(false);
  });
});

describe("preview", () => {
  it("collapses whitespace and truncates with an ellipsis", () => {
    expect(preview("a\n\n  b", 10)).toBe("a b");
    expect(preview("x".repeat(20), 10)).toHaveLength(10);
  });
});
