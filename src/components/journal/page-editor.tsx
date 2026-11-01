"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { History, Save, Trash2, X } from "lucide-react";
import { BookmarkButton } from "@/components/bookmark-button";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { api } from "@/lib/client";
import { cn, relativeTime } from "@/lib/utils";
import type { TiptapNode } from "@/domain/tiptap";
import { RichEditor } from "./rich-editor";
import { saveLabel, useAutosave } from "./use-autosave";

type PageStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type EditorPage = {
  id: string;
  title: string;
  icon: string | null;
  content: TiptapNode;
  status: PageStatus;
  parentId: string | null;
  topicId: string | null;
  updatedAt: string;
  version: number;
  tags: string[];
};

type Changes = {
  title: string;
  content: TiptapNode;
  status: PageStatus;
  parentId: string | null;
  topicId: string | null;
  tags: string[];
};

export function PageEditor({
  page,
  parentOptions,
  topicOptions,
  bookmarked,
}: {
  page: EditorPage;
  parentOptions: { id: string; title: string }[];
  topicOptions: { id: string; title: string; group: string }[];
  bookmarked: boolean;
}) {
  const router = useRouter();
  const updatedAt = useRef(page.updatedAt);
  const [title, setTitle] = useState(page.title);
  const [status, setStatus] = useState<PageStatus>(page.status);
  const [parentId, setParentId] = useState(page.parentId);
  const [topicId, setTopicId] = useState(page.topicId);
  const [tags, setTags] = useState(page.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [savedAt, setSavedAt] = useState(page.updatedAt);
  const [version, setVersion] = useState(page.version);

  const { state, error, queue, flush } = useAutosave<Changes>(async (changes) => {
    const res = await api<{ page: { updatedAt: string; version: number }; tags?: string[] }>(`/api/pages/${page.id}`, {
      method: "PATCH",
      body: { ...changes, expectedUpdatedAt: updatedAt.current },
    });
    updatedAt.current = res.page.updatedAt;
    setSavedAt(res.page.updatedAt);
    setVersion(res.page.version);
    if (res.tags) setTags(res.tags);
  });

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^#/, "");
    if (!t || tags.includes(t)) return;
    const next = [...tags, t];
    setTags(next);
    queue({ tags: next });
  };

  const saveVersion = async () => {
    const note = window.prompt("Describe this version (optional)", "");
    if (note === null) return;
    await flush();
    const r = await api<{ version: { version: number } }>(`/api/pages/${page.id}/versions`, { body: { note: note || undefined } });
    setVersion(r.version.version);
    router.refresh();
  };

  const remove = async () => {
    if (!window.confirm(`Delete “${title}”? Sub-pages are kept and moved to the top level. Version history is deleted.`)) return;
    await api(`/api/pages/${page.id}`, { method: "DELETE" });
    router.push("/journal");
    router.refresh();
  };

  const groups = [...new Set(topicOptions.map((t) => t.group))];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/journal" className="text-muted-foreground hover:text-foreground">Journal</Link>
        <span className="text-muted-foreground">/</span>
        <span className="truncate font-medium">{title || "Untitled"}</span>
        <span
          className={cn(
            "ml-auto text-xs",
            state === "error" || state === "conflict" ? "text-destructive" : "text-muted-foreground",
          )}
          role="status"
          aria-live="polite"
          title={error ?? undefined}
        >
          {state === "idle" ? `Saved ${relativeTime(savedAt)} · v${version}` : saveLabel(state)}
          {state === "conflict" ? (
            <button className="ml-2 underline" onClick={() => window.location.reload()}>Reload</button>
          ) : null}
        </span>
        <Select
          aria-label="Status"
          value={status}
          onChange={(e) => {
            const s = e.target.value as PageStatus;
            setStatus(s);
            queue({ status: s });
          }}
          className="h-8 text-xs"
        >
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
        <BookmarkButton entityType="PAGE" entityId={page.id} initial={bookmarked} />
        <Button variant="outline" size="sm" onClick={saveVersion}>
          <Save /> Version
        </Button>
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href={`/journal/${page.id}/history`} aria-label="Revision history" title="Revision history">
            <History />
          </Link>
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Delete page" onClick={remove}>
          <Trash2 className="text-muted-foreground" />
        </Button>
      </div>

      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          queue({ title: e.target.value });
        }}
        placeholder="Untitled"
        aria-label="Page title"
        maxLength={200}
        className="w-full bg-transparent text-3xl font-semibold tracking-tight placeholder:text-muted-foreground/50 focus:outline-none md:text-4xl"
      />

      <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm md:grid-cols-[auto_1fr] md:items-center">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="topic">Learning topic</label>
        <Select
          id="topic"
          value={topicId ?? ""}
          onChange={(e) => {
            const v = e.target.value || null;
            setTopicId(v);
            queue({ topicId: v });
          }}
        >
          <option value="">Not linked</option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {topicOptions.filter((t) => t.group === g).map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </optgroup>
          ))}
        </Select>
        <label className="text-xs font-medium text-muted-foreground" htmlFor="parent">Parent page</label>
        <Select
          id="parent"
          value={parentId ?? ""}
          onChange={(e) => {
            const v = e.target.value || null;
            setParentId(v);
            queue({ parentId: v });
          }}
        >
          <option value="">Top level</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </Select>
        <span className="text-xs font-medium text-muted-foreground">Tags</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-xs text-primary">
              #{t}
              <button
                type="button"
                aria-label={`Remove tag ${t}`}
                onClick={() => {
                  const next = tags.filter((x) => x !== t);
                  setTags(next);
                  queue({ tags: next });
                }}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag(tagDraft);
                setTagDraft("");
              }
            }}
            onBlur={() => {
              if (tagDraft) {
                addTag(tagDraft);
                setTagDraft("");
              }
            }}
            placeholder="add tag…"
            aria-label="Add tag"
            className="min-w-24 flex-1 bg-transparent text-xs focus:outline-none"
          />
        </div>
      </div>

      <RichEditor content={page.content} onChange={(doc) => queue({ content: doc })} />
    </div>
  );
}
