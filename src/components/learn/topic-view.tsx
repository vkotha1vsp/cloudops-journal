"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, FileText, Trash2 } from "lucide-react";
import { BookmarkButton } from "@/components/bookmark-button";
import { NewPageButton } from "@/components/journal/new-page-button";
import { RichEditor } from "@/components/journal/rich-editor";
import { saveLabel, useAutosave } from "@/components/journal/use-autosave";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { api } from "@/lib/client";
import { cn, relativeTime } from "@/lib/utils";
import { emptyDoc, type TiptapNode } from "@/domain/tiptap";
import { TOPIC_SECTIONS, type SectionKey } from "@/domain/topic-sections";

type HistoryEntry = { at: string; section: string; chars: number };
type ContentKey = Exclude<SectionKey, "history">;
type Progress = { status: "NOT_STARTED" | "LEARNING" | "REVIEWING" | "MASTERED"; confidence: number; nextReviewAt: string | null };

export type TopicViewData = {
  id: string;
  title: string;
  summary: string | null;
  categoryName: string;
  sections: Partial<Record<ContentKey, TiptapNode>> & { history?: HistoryEntry[] };
  updatedAt: string;
  pages: { id: string; title: string; status: string; updatedAt: string }[];
  progress: Progress;
};

const label = (key: string) => TOPIC_SECTIONS.find((s) => s.key === key)?.label ?? key;

export function TopicView({ topic, bookmarked }: { topic: TopicViewData; bookmarked: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState<SectionKey>("concept");
  const [title, setTitle] = useState(topic.title);
  const [summary, setSummary] = useState(topic.summary ?? "");
  const [progress, setProgress] = useState(topic.progress);
  const docs = useRef<Partial<Record<ContentKey, TiptapNode>>>({ ...topic.sections });
  const [filled, setFilled] = useState(() => new Set<SectionKey>(TOPIC_SECTIONS.filter((s) => s.key !== "history" && hasText(topic.sections[s.key])).map((s) => s.key)));

  // One autosave queue per topic; section edits are keyed so switching tabs never drops changes.
  const { state, queue, flush } = useAutosave<Record<string, unknown>>(async (changes) => {
    const { title: t, summary: s, ...sections } = changes as { title?: string; summary?: string } & Record<string, TiptapNode>;
    if (t !== undefined || s !== undefined) {
      await api(`/api/topics/${topic.id}`, { method: "PATCH", body: { ...(t !== undefined ? { title: t } : {}), ...(s !== undefined ? { summary: s || null } : {}) } });
    }
    for (const [key, doc] of Object.entries(sections)) {
      await api(`/api/topics/${topic.id}`, { method: "PATCH", body: { section: { key: key.replace(/^section:/, ""), doc } } });
    }
  });

  const updateProgress = async (next: Partial<Progress>, reviewed = false) => {
    const merged = { ...progress, ...next };
    setProgress(merged);
    const r = await api<{ progress: { nextReviewAt: string | null } }>(`/api/topics/${topic.id}/progress`, {
      method: "PUT",
      body: { status: merged.status, confidence: merged.confidence, reviewed },
    });
    setProgress({ ...merged, nextReviewAt: r.progress.nextReviewAt });
    router.refresh();
  };

  const history = [...(topic.sections.history ?? [])].reverse();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{topic.categoryName}</p>
          <input
            value={title}
            aria-label="Topic title"
            onChange={(e) => {
              setTitle(e.target.value);
              if (e.target.value.trim()) queue({ title: e.target.value });
            }}
            className="w-full bg-transparent text-3xl font-semibold tracking-tight focus:outline-none"
          />
          <input
            value={summary}
            aria-label="One-line summary"
            placeholder="One-line summary…"
            onChange={(e) => {
              setSummary(e.target.value);
              queue({ summary: e.target.value });
            }}
            className="mt-1 w-full bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-2 text-xs text-muted-foreground" role="status">{state === "idle" ? `Edited ${relativeTime(topic.updatedAt)}` : saveLabel(state)}</span>
          <BookmarkButton entityType="TOPIC" entityId={topic.id} initial={bookmarked} />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete topic"
            onClick={async () => {
              if (!window.confirm(`Delete topic “${title}”? Linked journal pages are kept.`)) return;
              await flush();
              await api(`/api/topics/${topic.id}`, { method: "DELETE" });
              router.push(window.location.pathname.split("/topic/")[0]!);
              router.refresh();
            }}
          >
            <Trash2 className="text-muted-foreground" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Status</span>
          <Select value={progress.status} className="h-8 text-xs" onChange={(e) => updateProgress({ status: e.target.value as Progress["status"] })}>
            <option value="NOT_STARTED">Not started</option>
            <option value="LEARNING">Learning</option>
            <option value="REVIEWING">Reviewing</option>
            <option value="MASTERED">Mastered</option>
          </Select>
        </label>
        <div className="flex items-center gap-1" role="group" aria-label="Confidence">
          <span className="mr-1 text-xs text-muted-foreground">Confidence</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Confidence ${n}`}
              onClick={() => updateProgress({ confidence: n, status: progress.status === "NOT_STARTED" ? "LEARNING" : progress.status })}
              className={cn("size-5 rounded-sm border", n <= progress.confidence ? "border-primary bg-primary" : "hover:border-primary/60")}
            />
          ))}
        </div>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarClock className="size-3.5" />
          {progress.nextReviewAt ? `Review ${relativeTime(progress.nextReviewAt)}` : "No review scheduled"}
        </span>
        {progress.status !== "NOT_STARTED" ? (
          <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => updateProgress({}, true)}>
            Mark reviewed
          </Button>
        ) : null}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_260px]">
        <div className="min-w-0 space-y-3">
          <div role="tablist" aria-label="Topic sections" className="flex flex-wrap gap-1">
            {TOPIC_SECTIONS.map((s, i) => (
              <button
                key={s.key}
                role="tab"
                aria-selected={active === s.key}
                type="button"
                onClick={() => setActive(s.key)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs transition-colors",
                  active === s.key ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="mr-1 tabular-nums opacity-50">{i + 1}</span>
                {s.label}
                {filled.has(s.key) ? <span className="ml-1.5 inline-block size-1.5 rounded-full bg-emerald-500 align-middle" /> : null}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{TOPIC_SECTIONS.find((s) => s.key === active)?.hint}</p>
          {active === "history" ? (
            <div className="rounded-xl border bg-card p-5">
              {history.length ? (
                <ol className="space-y-2 text-sm">
                  {history.map((h, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
                      <span>Edited <strong>{label(h.section)}</strong></span>
                      <span className="text-xs text-muted-foreground">{new Date(h.at).toLocaleString()} · {h.chars} chars</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">No edits recorded yet. Every section edit is logged here automatically.</p>
              )}
            </div>
          ) : (
            <RichEditor
              key={active}
              content={docs.current[active as ContentKey] ?? emptyDoc()}
              placeholder={TOPIC_SECTIONS.find((s) => s.key === active)?.hint}
              onChange={(doc) => {
                docs.current[active as ContentKey] = doc;
                setFilled((f) => {
                  const n = new Set(f);
                  if (hasText(doc)) n.add(active);
                  else n.delete(active);
                  return n;
                });
                queue({ [`section:${active}`]: doc });
              }}
            />
          )}
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Journal pages</h3>
              <Badge variant="secondary">{topic.pages.length}</Badge>
            </div>
            <ul className="space-y-1 text-sm">
              {topic.pages.map((p) => (
                <li key={p.id}>
                  <Link href={`/journal/${p.id}`} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted">
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{p.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <NewPageButton topicId={topic.id} title={`${title} notes`} label="New linked page" variant="outline" size="sm" className="mt-2 w-full" />
          </div>
          <div className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
            Architecture diagrams (Phase 2) and labs (Phase 5) will link here too. A topic can reference many of each.
          </div>
        </aside>
      </div>
    </div>
  );
}

function hasText(doc: TiptapNode | undefined): boolean {
  if (!doc) return false;
  const walk = (n: TiptapNode): boolean => Boolean(n.text?.trim()) || (n.content ?? []).some(walk);
  return walk(doc);
}
