import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { search, type SearchKind } from "@/server/search";
import { highlightSegments } from "@/domain/highlight";
import { relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Search" };

const KIND_LABEL: Record<SearchKind, string> = {
  page: "Journal page", topic: "Topic", lab: "Lab", troubleshooting: "Troubleshooting", diagram: "Diagram", tag: "Tag",
};
const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "All" }, { key: "page", label: "Pages" }, { key: "topic", label: "Topics" },
  { key: "troubleshooting", label: "Troubleshooting" }, { key: "lab", label: "Labs" }, { key: "diagram", label: "Diagrams" }, { key: "tag", label: "Tags" },
];

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  const user = await requireUser();
  const { q = "", kind = "" } = await searchParams;
  const kinds = FILTERS.some((f) => f.key === kind && kind) ? [kind as SearchKind] : undefined;
  const results = q.trim() ? await search(user.id, q, { kinds, limit: 50 }) : [];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <form className="flex gap-2" action="/search">
        <input
          name="q"
          defaultValue={q}
          autoFocus
          placeholder='Try: alb health check, "Target.FailedHealthChecks", terraform -azure'
          className="h-11 flex-1 rounded-lg border bg-card px-4 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {kind ? <input type="hidden" name="kind" value={kind} /> : null}
        <button className="rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Search</button>
      </form>
      <div className="flex flex-wrap gap-1 text-xs">
        {FILTERS.map((f) => (
          <Link
            key={f.key || "all"}
            href={`/search?q=${encodeURIComponent(q)}${f.key ? `&kind=${f.key}` : ""}`}
            className={`rounded-md px-2.5 py-1 ${kind === f.key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            {f.label}
          </Link>
        ))}
      </div>
      {q.trim() ? (
        <p className="text-sm text-muted-foreground">{results.length} result{results.length === 1 ? "" : "s"} for “{q}”</p>
      ) : (
        <p className="text-sm text-muted-foreground">Searches journal pages (including code blocks), topic sections, labs, troubleshooting records, diagrams and tags. Supports “quoted phrases”, OR, and -exclusions.</p>
      )}
      <div className="space-y-2">
        {results.map((r) => (
          <Link key={`${r.kind}:${r.id}`} href={r.href}>
            <Card className="p-4 transition-colors hover:border-primary/50">
              <div className="flex items-center gap-2">
                <Badge variant={r.kind === "troubleshooting" ? "warning" : r.kind === "topic" ? "default" : "secondary"}>{KIND_LABEL[r.kind]}</Badge>
                <h3 className="truncate font-medium">{r.title}</h3>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{relativeTime(r.updatedAt)}</span>
              </div>
              {r.snippet ? (
                <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
                  {highlightSegments(r.snippet).map((s, i) =>
                    s.hit ? <mark key={i} className="rounded bg-primary/25 px-0.5 text-foreground">{s.text}</mark> : <span key={i}>{s.text}</span>,
                  )}
                </p>
              ) : null}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
