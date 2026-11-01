"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { generateJSON } from "@tiptap/core";
import { BookOpen, FilePlus2, Info, Send } from "lucide-react";
import { api } from "@/lib/client";
import type { TiptapNode } from "@/domain/tiptap";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, Textarea } from "@/components/ui/input";
import { editorExtensions } from "@/components/journal/extensions";

type Source = { ref: string; kind: string; id: string; title: string; href: string };
type Answer = { enabled: boolean; output: string | null; html: string | null; sources: Source[]; jobId: string | null };
type Option = { id: string; title: string };

export function Assistant({
  kinds, enabled, provider, pages, diagrams, initial,
}: {
  kinds: Record<string, string>;
  enabled: boolean;
  provider: string;
  pages: Option[];
  diagrams: Option[];
  initial: { kind?: string; prompt?: string; pageId?: string; diagramId?: string };
}) {
  const router = useRouter();
  const [kind, setKind] = useState(initial.kind && initial.kind in kinds ? initial.kind : "question");
  const [prompt, setPrompt] = useState(initial.prompt ?? "");
  const [pageId, setPageId] = useState(initial.pageId ?? "");
  const [diagramId, setDiagramId] = useState(initial.diagramId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      setAnswer(await api<Answer>("/api/ai", { body: { kind, prompt, pageId: pageId || null, diagramId: diagramId || null } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    if (!answer?.html) return;
    setSaving(true);
    try {
      const body = generateJSON(answer.html, editorExtensions()) as TiptapNode;
      const note: TiptapNode = { type: "callout", attrs: { tone: "warning" }, content: [{ type: "paragraph", content: [{ type: "text", text: "AI-generated draft. Verify against official documentation before relying on it." }] }] };
      const title = prompt.split("\n")[0]!.replace(/^(draft|write|create)\s+(a\s+)?(journal\s+)?(page\s+)?(about|on|for)?\s*/i, "").slice(0, 120) || "AI draft";
      const r = await api<{ page: { id: string } }>("/api/pages", { body: { title, content: { type: "doc", content: [note, ...(body.content ?? [])] } } });
      if (answer.jobId) await api(`/api/ai/jobs/${answer.jobId}`, { body: { status: "APPROVED" } }).catch(() => undefined);
      router.push(`/journal/${r.page.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {!enabled ? (
        <Card className="flex gap-3 border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div className="space-y-1">
            <p className="font-medium">AI generation is off. Journal retrieval still works.</p>
            <p className="text-muted-foreground">
              To enable it, set <code>AI_PROVIDER=bedrock</code> and <code>BEDROCK_MODEL_ID</code> in the app&apos;s environment and give the instance role
              <code> bedrock:InvokeModel</code> on that model (see docs/07-phases-2-5.md). Keys never reach the browser.
            </p>
          </div>
        </Card>
      ) : null}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Task" value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select aria-label="Journal page context" value={pageId} onChange={(e) => setPageId(e.target.value)} className="max-w-[240px]">
            <option value="">No page context</option>
            {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </Select>
          <Select aria-label="Architecture context" value={diagramId} onChange={(e) => setDiagramId(e.target.value)} className="max-w-[240px]">
            <option value="">No architecture context</option>
            {diagrams.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </Select>
        </div>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="e.g. Why would ALB targets show unhealthy when the app works with curl on the instance?"
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && prompt.trim().length >= 3 && submit()}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{enabled ? `Provider: ${provider}. ` : ""}Answers are suggestions; nothing is executed or saved without you.</span>
          <Button onClick={submit} disabled={busy || prompt.trim().length < 3}><Send /> {busy ? "Thinking…" : enabled ? "Ask" : "Search my journal"}</Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </Card>

      {answer ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <Card className="min-w-0 p-5">
            {answer.html ? (
              <>
                <div className="ProseMirror ai-answer max-w-none text-sm" dangerouslySetInnerHTML={{ __html: answer.html }} />
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                  <Button size="sm" variant="outline" onClick={saveDraft} disabled={saving}><FilePlus2 /> {saving ? "Saving…" : "Save as draft page"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => answer.output && navigator.clipboard.writeText(answer.output)}>Copy Markdown</Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {answer.sources.length ? "AI generation is off; these are the journal entries that match your question." : "Nothing in your journal matches yet."}
              </p>
            )}
          </Card>
          <Card className="h-fit space-y-2 p-4">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold"><BookOpen className="size-4" /> Journal sources</h3>
            {answer.sources.length ? (
              <ul className="space-y-1.5 text-sm">
                {answer.sources.map((s) => (
                  <li key={s.ref} className="flex gap-2">
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">[{s.ref}]</span>
                    <Link href={s.href} className="min-w-0 hover:underline"><span className="text-xs text-muted-foreground">{s.kind} · </span>{s.title}</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None. The answer is general guidance only.</p>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
