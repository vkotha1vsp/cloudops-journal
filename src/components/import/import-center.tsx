"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { generateJSON } from "@tiptap/core";
import { AlertTriangle, ClipboardPaste, FileUp, Network, RotateCcw, Save, Sparkles } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { TiptapNode } from "@/domain/tiptap";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RichEditor } from "@/components/journal/rich-editor";
import { editorExtensions } from "@/components/journal/extensions";

type Suggestion = { id: string; title: string; category: string; track: string };
type Result = {
  id: string;
  title: string;
  html: string | null;
  doc: TiptapNode | null;
  warnings: string[];
  sourceType: string;
  detected: { provider: string; services: { kind: string; label: string; mentions: number }[]; mermaidBlocks: number; codeBlocks: number; architecturePrompt: string | null };
  suggestions: Suggestion[];
};
type TopicOption = { id: string; title: string; group: string };

const ACCEPT = ".md,.markdown,.docx,.pdf,.txt,.html,.htm,.json,.mmd,.mermaid";

export function ImportCenter({ topics, maxMb }: { topics: TopicOption[]; maxMb: number }) {
  const router = useRouter();
  const [tab, setTab] = useState<"file" | "paste">("file");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (send: () => Promise<Result>) => {
    setBusy(true);
    setError(null);
    try {
      setResult(await send());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };
  const uploadFile = (file: File) =>
    run(async () => {
      if (file.size > maxMb * 1024 * 1024) throw new Error(`Files must be under ${maxMb} MB`);
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/imports", { method: "POST", body, credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, data.error ?? `Import failed (${res.status})`);
      return data as Result;
    });
  const submitPaste = () => run(() => api<Result>("/api/imports", { body: { markdown: paste } }));

  if (result) return <Preview key={result.id} result={result} topics={topics} onReset={() => setResult(null)} onSaved={(id) => (router.push(`/journal/${id}`), router.refresh())} />;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex gap-1 rounded-lg border p-1 text-sm sm:w-fit">
        <button className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5", tab === "file" ? "bg-accent text-accent-foreground" : "text-muted-foreground")} onClick={() => setTab("file")}>
          <FileUp className="size-4" /> Upload a document
        </button>
        <button className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5", tab === "paste" ? "bg-accent text-accent-foreground" : "text-muted-foreground")} onClick={() => setTab("paste")}>
          <ClipboardPaste className="size-4" /> Paste from ChatGPT
        </button>
      </div>
      {tab === "file" ? (
        <div
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) void uploadFile(f);
          }}
          className={cn("grid place-items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center", drag && "border-primary bg-primary/5")}
        >
          <FileUp className="size-8 text-muted-foreground" />
          <p className="text-sm">Drop a file here, or</p>
          <Button disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Extracting…" : "Choose file"}</Button>
          <input ref={fileRef} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
          <p className="text-xs text-muted-foreground">Markdown, DOCX, PDF, TXT, HTML, JSON or Mermaid (.mmd) up to {maxMb} MB. Markdown converts best.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={14}
            className="font-mono text-[13px]"
            placeholder={"In ChatGPT, use the copy button under the answer (it copies Markdown), then paste here.\n\n# Title\n\nText, tables, ```bash code``` and ```mermaid diagrams``` are preserved."}
          />
          <div className="flex justify-end">
            <Button disabled={busy || !paste.trim()} onClick={submitPaste}><Sparkles /> {busy ? "Converting…" : "Convert to page"}</Button>
          </div>
        </div>
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </Card>
  );
}

function Preview({ result, topics, onReset, onSaved }: { result: Result; topics: TopicOption[]; onReset: () => void; onSaved: (pageId: string) => void }) {
  const initialDoc = useMemo<TiptapNode>(() => {
    if (result.doc) return result.doc;
    try {
      return generateJSON(result.html ?? "", editorExtensions()) as TiptapNode;
    } catch {
      return { type: "doc", content: [] };
    }
  }, [result]);
  const docRef = useRef<TiptapNode>(initialDoc);
  const [title, setTitle] = useState(result.title);
  const [topicId, setTopicId] = useState(result.suggestions[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = result.detected;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ pageId: string }>(`/api/imports/${result.id}`, { body: { title, content: docRef.current, topicId: topicId || null } });
      onSaved(r.pageId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setBusy(false);
    }
  };
  const studioHref = d.architecturePrompt ? `/studio/new?text=${encodeURIComponent(d.architecturePrompt)}${topicId ? `&topic=${topicId}` : ""}` : null;

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Preview · {result.sourceType.toUpperCase()}</Badge>
          <span className="text-sm text-muted-foreground">Nothing is saved until you click Save as page. Edit freely below.</span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={onReset}><RotateCcw /> Start over</Button>
            <Button size="sm" onClick={save} disabled={busy || !title.trim()}><Save /> {busy ? "Saving…" : "Save as page"}</Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_280px]">
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Page title</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Knowledge category (topic)</span>
            <Select value={topicId} onChange={(e) => setTopicId(e.target.value)} className="w-full">
              <option value="">No topic (journal only)</option>
              {result.suggestions.length ? (
                <optgroup label="Suggested from content">
                  {result.suggestions.map((s) => <option key={`s-${s.id}`} value={s.id}>{s.title} · {s.track} / {s.category}</option>)}
                </optgroup>
              ) : null}
              <optgroup label="All topics">
                {topics.map((t) => <option key={t.id} value={t.id}>{t.title} · {t.group}</option>)}
              </optgroup>
            </Select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Detected:</span>
          {d.services.length ? d.services.map((s) => <Badge key={s.kind} variant={d.provider === "azure" ? "azure" : "aws"}>{s.label} ×{s.mentions}</Badge>) : <span className="text-muted-foreground">no cloud services</span>}
          <span className="text-muted-foreground">· {d.codeBlocks} code blocks · {d.mermaidBlocks} Mermaid diagrams</span>
          {studioHref ? (
            <Link href={studioHref} target="_blank" className="ml-auto flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted"><Network className="size-3.5" /> Suggest an architecture diagram</Link>
          ) : null}
        </div>
        {result.warnings.length ? (
          <ul className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            {result.warnings.map((w) => <li key={w} className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{w}</li>)}
          </ul>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </Card>
      <RichEditor content={initialDoc} onChange={(doc) => (docRef.current = doc)} />
    </div>
  );
}
