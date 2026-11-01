import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { parseRequest } from "@/domain/architecture/parse";
import { service } from "@/domain/architecture/catalog";

export type SourceType = "md" | "docx" | "pdf" | "txt" | "html" | "json" | "mmd" | "paste";

export const SOURCE_TYPES: Record<string, SourceType> = {
  ".md": "md", ".markdown": "md", ".docx": "docx", ".pdf": "pdf", ".txt": "txt", ".html": "html", ".htm": "html", ".json": "json", ".mmd": "mmd", ".mermaid": "mmd",
};

export function sourceTypeOf(fileName: string): SourceType | null {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? null : SOURCE_TYPES[fileName.slice(dot).toLowerCase()] ?? null;
}

const MERMAID_START = /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|journey|mindmap|timeline|gitGraph|C4Context|architecture-beta)\b/;

/**
 * Only structural tags the journal editor understands survive. Scripts, styles, event handlers,
 * iframes and inline images (data: URLs) are removed; links are limited to http(s)/mailto.
 */
export function sanitize(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "blockquote", "pre", "code", "ul", "ol", "li", "strong", "b", "em", "i", "s", "del",
      "a", "table", "thead", "tbody", "tr", "th", "td", "input",
    ],
    allowedAttributes: {
      a: ["href"],
      code: ["class"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
      input: ["type", "checked", "disabled"],
      ul: ["data-type"],
      li: ["data-type", "data-checked"],
    },
    allowedClasses: { code: [/^language-[a-z0-9+#-]+$/] },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    exclusiveFilter: (frame) => frame.tag === "input" && frame.attribs.type !== "checkbox",
    transformTags: {
      h4: "h3",
      h5: "h3",
      h6: "h3",
      b: "strong",
      i: "em",
      del: "s",
      a: (tagName, attribs) => ({ tagName, attribs: { href: attribs.href ?? "" } }),
    },
  });
}

/** Marks unlabelled code blocks that contain Mermaid source so the editor previews them. */
export function tagMermaid(html: string): string {
  return html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (whole, body: string) =>
    MERMAID_START.test(decode(body)) ? `<pre><code class="language-mermaid">${body}</code></pre>` : whole,
  );
}

function decode(s: string) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** ChatGPT-style Markdown → sanitised HTML. GitHub-flavoured tables and task lists are supported. */
export function markdownToHtml(md: string): string {
  const html = marked.parse(md.replace(/\r\n/g, "\n"), { gfm: true, breaks: false, async: false }) as string;
  // marked renders "- [ ] x" as <li><input type="checkbox" disabled> x</li>; turn those lists into Tiptap task lists.
  const tasks = html.replace(/<ul>\s*((?:<li><input[^>]*type="checkbox"[^>]*>[\s\S]*?<\/li>\s*)+)<\/ul>/g, (_w, items: string) => {
    const lis = items.replace(/<li><input([^>]*)>\s*([\s\S]*?)<\/li>/g, (_m, attrs: string, body: string) => `<li data-type="taskItem" data-checked="${/checked/.test(attrs)}"><p>${body.trim()}</p></li>`);
    return `<ul data-type="taskList">${lis}</ul>`;
  });
  return tagMermaid(sanitize(tasks));
}

export function textToHtml(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (MERMAID_START.test(p) ? `<pre><code class="language-mermaid">${escapeHtml(p)}</code></pre>` : `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`))
    .join("\n");
}

export function mermaidToHtml(src: string): string {
  return `<pre><code class="language-mermaid">${escapeHtml(src.trim())}</code></pre>`;
}

export function htmlToText(html: string): string {
  return decode(html.replace(/<(br|\/p|\/h\d|\/li|\/pre|\/tr)>/g, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

export function titleFrom(html: string, fallback: string): string {
  const h = /<h1>([\s\S]*?)<\/h1>/.exec(html) ?? /<h2>([\s\S]*?)<\/h2>/.exec(html);
  const t = h ? htmlToText(h[1]!) : "";
  return (t || fallback.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ")).slice(0, 200).trim() || "Imported document";
}

export type Detection = {
  provider: "aws" | "azure" | "devops";
  services: { kind: string; label: string; mentions: number }[];
  mermaidBlocks: number;
  codeBlocks: number;
  /** A Studio prompt when the text describes at least two traffic-path services. */
  architecturePrompt: string | null;
};

export function detect(html: string): Detection {
  const text = htmlToText(html);
  const parsed = parseRequest(text.slice(0, 200_000));
  const counts = new Map<string, number>();
  for (const m of parsed.matched) if (m.kind !== "client") counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1);
  const services = [...counts.entries()]
    .map(([kind, mentions]) => ({ kind, label: service(kind).label, mentions }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 12);
  const devops = /\b(jenkins|docker|kubernetes|kubectl|github actions|gitlab|terraform|ansible|helm|sonarqube)\b/i.test(text);
  const traffic = services.filter((s) => service(s.kind).role === "traffic" && service(s.kind).provider !== "generic");
  const provider = services.length ? parsed.provider : devops ? "devops" : parsed.provider;
  return {
    provider,
    services,
    mermaidBlocks: (html.match(/class="language-mermaid"/g) ?? []).length,
    codeBlocks: (html.match(/<pre>/g) ?? []).length,
    architecturePrompt:
      traffic.length >= 2 ? `Create an ${parsed.provider === "azure" ? "Azure" : "AWS"} architecture using ${traffic.slice(0, 8).map((s) => s.label).join(", ")}` : null,
  };
}
