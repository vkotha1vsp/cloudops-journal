import { z } from "zod";

/** A Tiptap/ProseMirror JSON node. The editor only renders node types in its schema. */
export type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
};

export const tiptapNodeSchema: z.ZodType<TiptapNode> = z.lazy(() =>
  z
    .object({
      type: z.string().min(1).max(64).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
      attrs: z.record(z.unknown()).optional(),
      content: z.array(tiptapNodeSchema).max(20_000).optional(),
      marks: z
        .array(z.object({ type: z.string().max(64), attrs: z.record(z.unknown()).optional() }).strict())
        .max(20)
        .optional(),
      text: z.string().max(200_000).optional(),
    })
    .strict(),
);

export const tiptapDocSchema = tiptapNodeSchema.refine((n) => n.type === "doc", "Root node must be a doc");

export const emptyDoc = (): TiptapNode => ({ type: "doc", content: [] });

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "codeBlock",
  "blockquote",
  "listItem",
  "taskItem",
  "tableCell",
  "tableHeader",
  "callout",
  "horizontalRule",
]);

/**
 * Flatten a document to plain text for full-text search and previews.
 * Code blocks are included verbatim so commands and error output stay searchable.
 */
export function extractText(node: TiptapNode | null | undefined): string {
  if (!node) return "";
  const parts: string[] = [];
  const walk = (n: TiptapNode) => {
    if (n.type === "text" && n.text) parts.push(n.text);
    if (n.type === "hardBreak") parts.push("\n");
    n.content?.forEach(walk);
    // Nested blocks (paragraph inside a list item) end with a single line break, not two.
    if (BLOCK_TYPES.has(n.type) && parts[parts.length - 1] !== "\n") parts.push("\n");
  };
  walk(node);
  return parts
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function preview(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Small builders used by seed data and tests. */
export const doc = (...content: TiptapNode[]): TiptapNode => ({ type: "doc", content });
export const p = (text: string): TiptapNode => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] });
export const h = (level: 1 | 2 | 3, text: string): TiptapNode => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});
export const code = (language: string, text: string): TiptapNode => ({
  type: "codeBlock",
  attrs: { language },
  content: [{ type: "text", text }],
});
export const bullets = (...items: string[]): TiptapNode => ({
  type: "bulletList",
  content: items.map((t) => ({ type: "listItem", content: [p(t)] })),
});
export const callout = (tone: "info" | "warning" | "tip", text: string): TiptapNode => ({
  type: "callout",
  attrs: { tone },
  content: [p(text)],
});
