import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { s3 } from "@/lib/s3";
import { HttpError, notFound } from "@/lib/errors";
import {
  detect, markdownToHtml, mermaidToHtml, sanitize, sourceTypeOf, tagMermaid, textToHtml, titleFrom, type Detection, type SourceType,
} from "@/domain/import/convert";
import { tiptapDocSchema, type TiptapNode } from "@/domain/tiptap";
import { createPage } from "@/server/pages";
import type { Prisma } from "@/generated/prisma/client";

export type Extracted = { html?: string; doc?: TiptapNode; title: string; warnings: string[] };

/** Converts a document into sanitised HTML (or a ready Tiptap doc for our own JSON exports). */
export async function extract(fileName: string, type: SourceType, buf: Buffer): Promise<Extracted> {
  const warnings: string[] = [];
  const text = () => buf.toString("utf8");
  let html = "";
  switch (type) {
    case "md":
    case "paste":
      html = markdownToHtml(text());
      break;
    case "txt":
      // ChatGPT "plain text" is almost always Markdown; render it as such.
      html = markdownToHtml(text());
      break;
    case "html":
      html = tagMermaid(sanitize(text()));
      if (/<(script|style|iframe|img)\b/i.test(text())) warnings.push("Scripts, styles, frames and images were removed.");
      break;
    case "mmd":
      html = mermaidToHtml(text());
      break;
    case "json": {
      let data: unknown;
      try {
        data = JSON.parse(text());
      } catch {
        throw new HttpError(422, "The JSON file could not be parsed");
      }
      const doc = tiptapDocSchema.safeParse(data);
      if (doc.success) return { doc: doc.data, title: fileName.replace(/\.json$/i, ""), warnings };
      const o = data as Record<string, unknown>;
      const md = typeof o?.markdown === "string" ? o.markdown : typeof o?.content === "string" ? o.content : null;
      if (md) {
        html = markdownToHtml(md);
        if (typeof o.title === "string") return { html, title: o.title.slice(0, 200), warnings };
      } else {
        html = `<pre><code class="language-json">${JSON.stringify(data, null, 2).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</code></pre>`;
        warnings.push("No title/markdown fields found; the JSON was imported as a code block.");
      }
      break;
    }
    case "docx": {
      const mammoth = await import("mammoth");
      const r = await mammoth.convertToHtml(
        { buffer: buf },
        {
          styleMap: ["p[style-name='Code'] => pre > code:fresh", "p[style-name='Source Code'] => pre > code:fresh", "r[style-name='Code Char'] => code"],
          convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: "" })),
        },
      );
      html = tagMermaid(sanitize(r.value));
      if (/<img/i.test(r.value)) warnings.push("Images in the Word file were not imported; upload them to the page separately.");
      if (r.messages.some((m) => m.type === "warning")) warnings.push("Some Word formatting (columns, text boxes, custom styles) could not be converted exactly.");
      break;
    }
    case "pdf": {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text: pages } = await extractText(pdf, { mergePages: false });
      const all = (pages as string[]).join("\n\n").trim();
      if (all.replace(/\s/g, "").length < 20) throw new HttpError(422, "No text found. This PDF looks scanned; OCR is not supported, so please import a text version.");
      html = textToHtml(all);
      warnings.push("PDF text was extracted without its layout: headings, tables and code blocks need manual touch-up in the preview.");
      break;
    }
  }
  if (!html.trim()) throw new HttpError(422, "Nothing could be extracted from this document");
  return { html, title: titleFrom(html, fileName), warnings };
}

async function storeOriginal(ownerId: string, fileName: string, mime: string, buf: Buffer) {
  const e = env();
  if (!e.S3_ATTACHMENTS_BUCKET) return null;
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const key = `users/${ownerId}/imports/${randomUUID()}${ext}`;
  await s3().send(new PutObjectCommand({ Bucket: e.S3_ATTACHMENTS_BUCKET, Key: key, Body: buf, ContentType: mime || "application/octet-stream", ServerSideEncryption: "AES256" }));
  return key;
}

export async function createImport(ownerId: string, input: { fileName: string; mime: string; buf: Buffer; paste?: boolean }) {
  const e = env();
  if (input.buf.length > e.MAX_UPLOAD_MB * 1024 * 1024) throw new HttpError(413, `Files must be under ${e.MAX_UPLOAD_MB} MB`);
  if (/[\\/]/.test(input.fileName) || input.fileName.length > 200) throw new HttpError(400, "Invalid file name");
  const type: SourceType | null = input.paste ? "paste" : sourceTypeOf(input.fileName);
  if (!type) throw new HttpError(415, "Supported types: .md, .docx, .pdf, .txt, .html, .json, .mmd");
  if (type === "docx" && input.buf.subarray(0, 2).toString("latin1") !== "PK") throw new HttpError(415, "That is not a valid .docx file");
  if (type === "pdf" && input.buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new HttpError(415, "That is not a valid PDF");

  const row = await db().import.create({ data: { ownerId, sourceName: input.fileName, sourceType: type, status: "UPLOADED" }, select: { id: true } });
  try {
    const ex = await extract(input.fileName, type, input.buf);
    const detected: Detection = ex.html ? detect(ex.html) : { provider: "aws", services: [], mermaidBlocks: 0, codeBlocks: 0, architecturePrompt: null };
    const s3Key = input.paste ? null : await storeOriginal(ownerId, input.fileName, input.mime, input.buf).catch(() => {
      ex.warnings.push("The original file could not be stored in S3; the extracted content is still available.");
      return null;
    });
    const suggestions = await suggestTopics(ownerId, detected, ex.title);
    await db().import.update({
      where: { id: row.id },
      data: {
        status: "PARSED",
        s3Key,
        extracted: { html: ex.html ?? null, doc: (ex.doc ?? null) as Prisma.InputJsonValue, title: ex.title } as Prisma.InputJsonValue,
        detected: { ...detected, suggestions } as unknown as Prisma.InputJsonValue,
        warnings: ex.warnings,
      },
    });
    return { id: row.id, title: ex.title, html: ex.html ?? null, doc: ex.doc ?? null, warnings: ex.warnings, detected, suggestions, sourceType: type };
  } catch (err) {
    await db().import.update({ where: { id: row.id }, data: { status: "FAILED", warnings: [err instanceof Error ? err.message : "Extraction failed"] } });
    throw err;
  }
}

/** Ranks the user's own topics by how often the document mentions them. */
async function suggestTopics(ownerId: string, d: Detection, title: string) {
  const topics = await db().topic.findMany({ where: { ownerId }, select: { id: true, title: true, category: { select: { track: true, name: true } } } });
  const labels = d.services.map((s) => s.label.toLowerCase());
  const t = title.toLowerCase();
  const track = d.provider === "azure" ? "AZURE" : d.provider === "devops" ? "DEVOPS" : "AWS";
  return topics
    .map((tp) => {
      const name = tp.title.toLowerCase();
      let score = 0;
      if (t.includes(name)) score += 5;
      d.services.forEach((s, i) => {
        const l = labels[i]!;
        if (l === name || l.includes(name) || name.includes(l)) score += Math.min(s.mentions, 5) + (i === 0 ? 2 : 0);
      });
      if (tp.category.track === track) score += score ? 1 : 0;
      return { id: tp.id, title: tp.title, category: tp.category.name, track: tp.category.track, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export const saveImportSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: tiptapDocSchema,
  topicId: z.string().max(64).nullish(),
  parentId: z.string().max(64).nullish(),
});

export async function saveImport(ownerId: string, id: string, input: z.infer<typeof saveImportSchema>) {
  const imp = await db().import.findFirst({ where: { id, ownerId } });
  if (!imp) throw notFound("Import");
  if (imp.status === "SAVED" && imp.pageId) throw new HttpError(409, "This import was already saved");
  const when = new Date().toISOString().slice(0, 10);
  const label = imp.sourceType === "paste" ? "Pasted from ChatGPT" : `Imported from ${imp.sourceName}`;
  const attribution: TiptapNode = {
    type: "callout",
    attrs: { tone: "info" },
    content: [{ type: "paragraph", content: [{ type: "text", text: `${label} on ${when}. Review generated content before relying on it.` }] }],
  };
  const content: TiptapNode = { type: "doc", content: [attribution, ...(input.content.content ?? [])] };
  const page = await createPage(ownerId, { title: input.title, content, topicId: input.topicId ?? null, parentId: input.parentId ?? null });
  await db().import.update({ where: { id }, data: { status: "SAVED", pageId: page.id } });
  return { pageId: page.id };
}

export async function listImports(ownerId: string, take = 20) {
  return db().import.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, sourceName: true, sourceType: true, status: true, warnings: true, createdAt: true, page: { select: { id: true, title: true } } },
  });
}
