import { HL_END, HL_START } from "@/domain/highlight";
import { db } from "@/lib/db";
import { slugFromTrack } from "@/domain/tracks";

export type SearchKind = "page" | "topic" | "lab" | "troubleshooting" | "diagram" | "tag";

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  /** Snippet with matches wrapped in ⟦ ⟧ markers. Render as text, never as HTML. */
  snippet: string;
  href: string;
  rank: number;
  updatedAt: Date;
};

const HEADLINE = `StartSel=${HL_START}, StopSel=${HL_END}, MaxWords=28, MinWords=12, MaxFragments=2, FragmentDelimiter=" … "`;

// Must match the expression indexes in prisma/migrations/*_fulltext_search exactly.
const DOC = {
  page: `coalesce("title", '') || ' ' || coalesce("plainText", '')`,
  topic: `coalesce("title", '') || ' ' || coalesce("summary", '') || ' ' || coalesce("plainText", '')`,
  lab: `coalesce("title", '') || ' ' || coalesce("objective", '') || ' ' || coalesce("observations", '') || ' ' || coalesce("errorsEncountered", '') || ' ' || coalesce("rootCause", '') || ' ' || coalesce("resolution", '')`,
  troubleshooting: `coalesce("title", '') || ' ' || coalesce("errorMessage", '') || ' ' || coalesce("symptoms", '') || ' ' || coalesce("rootCause", '') || ' ' || coalesce("investigation", '') || ' ' || coalesce("resolution", '')`,
  diagram: `coalesce("title", '') || ' ' || coalesce("description", '')`,
} as const;

type Row = { kind: SearchKind; id: string; title: string; snippet: string; rank: number; updatedAt: Date; extra: string | null };

/**
 * Global search across pages, topics, labs, troubleshooting cases, diagrams and tags.
 * Uses websearch_to_tsquery (supports "quoted phrases", OR, -exclusions). When full-text
 * finds nothing (e.g. an exact CLI error fragment the stemmer splits oddly), falls back to a
 * case-insensitive substring match so pasted error output is still found.
 */
export async function search(ownerId: string, rawQuery: string, opts: { kinds?: SearchKind[]; limit?: number } = {}) {
  const q = rawQuery.trim().slice(0, 200);
  if (!q) return [] as SearchHit[];
  const limit = Math.min(opts.limit ?? 30, 100);
  const kinds = new Set<SearchKind>(opts.kinds?.length ? opts.kinds : ["page", "topic", "lab", "troubleshooting", "diagram", "tag"]);

  let rows = await fullText(ownerId, q, kinds, limit);
  if (rows.length === 0) rows = await substring(ownerId, q, kinds, limit);
  return rows.map(toHit);
}

function selectFt(kind: Exclude<SearchKind, "tag">, table: string, extra: string, snippetCol: string) {
  const vec = `to_tsvector('english', ${DOC[kind]})`;
  return `SELECT '${kind}'::text AS kind, "id", "title",
            ts_headline('english', ${snippetCol}, query, '${HEADLINE}') AS snippet,
            ts_rank_cd(${vec}, query)::float8 AS rank, "updatedAt", ${extra} AS extra
          FROM "${table}", q
          WHERE "ownerId" = $1 AND ${vec} @@ query`;
}

async function fullText(ownerId: string, query: string, kinds: Set<SearchKind>, limit: number): Promise<Row[]> {
  const parts: string[] = [];
  if (kinds.has("page")) parts.push(selectFt("page", "JournalPage", `NULL::text`, `coalesce("plainText", '')`) + ` AND "status" <> 'ARCHIVED'`);
  if (kinds.has("topic"))
    parts.push(
      selectFt("topic", "Topic", `(SELECT c."track"::text FROM "Category" c WHERE c."id" = "Topic"."categoryId")`, `coalesce("summary", '') || ' ' || coalesce("plainText", '')`),
    );
  if (kinds.has("lab")) parts.push(selectFt("lab", "Lab", `NULL::text`, `"objective" || ' ' || "observations" || ' ' || "errorsEncountered" || ' ' || "resolution"`));
  if (kinds.has("troubleshooting"))
    parts.push(selectFt("troubleshooting", "TroubleshootingCase", `"area"`, `"errorMessage" || ' ' || "symptoms" || ' ' || "rootCause" || ' ' || "resolution"`));
  if (kinds.has("diagram")) parts.push(selectFt("diagram", "ArchitectureDiagram", `"provider"`, `coalesce("description", '')`));
  if (kinds.has("tag"))
    parts.push(`SELECT 'tag'::text AS kind, t."id", t."name" AS title, ''::text AS snippet, 0.5::float8 AS rank,
                  t."createdAt" AS "updatedAt", NULL::text AS extra
                FROM "Tag" t, q WHERE t."ownerId" = $1 AND t."name" ILIKE '%' || $3 || '%'`);
  if (!parts.length) return [];
  const sql = `WITH q AS (SELECT websearch_to_tsquery('english', $2) AS query, $3::text AS raw)
               ${parts.join("\nUNION ALL\n")}
               ORDER BY rank DESC, "updatedAt" DESC LIMIT ${limit}`;
  return db().$queryRawUnsafe<Row[]>(sql, ownerId, query, escapeLike(query));
}

async function substring(ownerId: string, query: string, kinds: Set<SearchKind>, limit: number): Promise<Row[]> {
  const like = `%${escapeLike(query)}%`;
  const parts: string[] = [];
  const sel = (kind: SearchKind, table: string, haystack: string, extra = "NULL::text") =>
    `SELECT '${kind}'::text AS kind, "id", "title",
            substr(${haystack}, greatest(1, strpos(lower(${haystack}), lower($3)) - 60), 220) AS snippet,
            0.1::float8 AS rank, "updatedAt", ${extra} AS extra
     FROM "${table}" WHERE "ownerId" = $1 AND ${haystack} ILIKE $2`;
  if (kinds.has("page")) parts.push(sel("page", "JournalPage", `("title" || ' ' || "plainText")`));
  if (kinds.has("topic")) parts.push(sel("topic", "Topic", `("title" || ' ' || "plainText")`, `(SELECT c."track"::text FROM "Category" c WHERE c."id" = "Topic"."categoryId")`));
  if (kinds.has("lab")) parts.push(sel("lab", "Lab", `("title" || ' ' || "errorsEncountered" || ' ' || "observations")`));
  if (kinds.has("troubleshooting")) parts.push(sel("troubleshooting", "TroubleshootingCase", `("title" || ' ' || "errorMessage" || ' ' || "investigation")`, `"area"`));
  if (!parts.length) return [];
  const sql = `${parts.join("\nUNION ALL\n")} ORDER BY "updatedAt" DESC LIMIT ${limit}`;
  const rows = await db().$queryRawUnsafe<Row[]>(sql, ownerId, like, query);
  return rows.map((r) => ({ ...r, snippet: markSubstring(r.snippet, query) }));
}

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function markSubstring(text: string, needle: string): string {
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return text;
  return `${text.slice(0, i)}${HL_START}${text.slice(i, i + needle.length)}${HL_END}${text.slice(i + needle.length)}`;
}

function toHit(r: Row): SearchHit {
  const href = (() => {
    switch (r.kind) {
      case "page":
        return `/journal/${r.id}`;
      case "topic":
        return `/learn/${slugFromTrack(r.extra ?? "AWS")}/topic/${r.id}`;
      case "lab":
        return `/labs/${r.id}`;
      case "troubleshooting":
        return `/troubleshooting/${r.id}`;
      case "diagram":
        return `/studio/${r.id}`;
      case "tag":
        return `/journal?tag=${encodeURIComponent(r.title)}`;
    }
  })();
  return { kind: r.kind, id: r.id, title: r.title, snippet: r.snippet ?? "", href, rank: Number(r.rank), updatedAt: r.updatedAt };
}
