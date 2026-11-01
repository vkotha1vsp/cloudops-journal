"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown, ArrowUp, CheckCircle2, Circle, Copy, ExternalLink, ImagePlus, Paperclip, Plus, Siren, Trash2,
} from "lucide-react";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DiagramCanvas } from "@/components/architecture/diagram-canvas";
import { useDiagramGraph } from "@/components/architecture/topic-diagrams";
import { Area, SaveIndicator, useDebouncedSave } from "./fields";

export type LabStepData = { title: string; instruction: string; commands: string; expected: string; actual: string; done: boolean };
export type LabData = {
  id: string;
  title: string;
  objective: string;
  prerequisites: string;
  estimatedCost: string | null;
  expectedResults: string;
  observations: string;
  errorsEncountered: string;
  rootCause: string;
  resolution: string;
  cleanup: string;
  terraform: string;
  checklist: { text: string; done: boolean }[];
  status: "PLANNED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
  topicId: string | null;
  diagramId: string | null;
  steps: LabStepData[];
  startedAt: string | null;
  completedAt: string | null;
  cases: { id: string; title: string; area: string }[];
  attachments: { id: string; fileName: string; mimeType: string }[];
};

const STATUS: Record<LabData["status"], string> = { PLANNED: "Planned", IN_PROGRESS: "In progress", BLOCKED: "Blocked", COMPLETED: "Completed" };

type Option = { id: string; title: string };

export function LabEditor({ initial, topics, diagrams, conceptId }: { initial: LabData; topics: Option[]; diagrams: Option[]; conceptId?: string }) {
  const router = useRouter();
  const [lab, setLab] = useState(initial);
  const [attachments, setAttachments] = useState(initial.attachments);
  const [uploading, setUploading] = useState<string | null>(null);

  const labRef = useRef(lab);
  const saver = useDebouncedSave(async () => {
    const l = labRef.current;
    const body = {
      title: l.title, objective: l.objective, prerequisites: l.prerequisites, estimatedCost: l.estimatedCost, expectedResults: l.expectedResults,
      observations: l.observations, errorsEncountered: l.errorsEncountered, rootCause: l.rootCause, resolution: l.resolution, cleanup: l.cleanup,
      terraform: l.terraform, checklist: l.checklist, status: l.status, topicId: l.topicId, diagramId: l.diagramId, steps: l.steps,
    };
    await api(`/api/labs/${initial.id}`, { method: "PATCH", body });
  });

  const set = <K extends keyof LabData>(k: K, v: LabData[K]) => {
    const next = { ...labRef.current, [k]: v };
    labRef.current = next;
    setLab(next);
    saver.touch();
  };
  const setStep = (i: number, patch: Partial<LabStepData>) => set("steps", lab.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const moveStep = (i: number, d: -1 | 1) => {
    const steps = [...lab.steps];
    const [s] = steps.splice(i, 1);
    steps.splice(i + d, 0, s!);
    set("steps", steps);
  };

  const done = lab.steps.filter((s) => s.done).length;
  const checks = lab.checklist.filter((c) => c.done).length;

  const remove = async () => {
    if (!confirm(`Delete lab "${lab.title}"? This cannot be undone.`)) return;
    await api(`/api/labs/${lab.id}`, { method: "DELETE" });
    router.push("/labs");
    router.refresh();
  };

  const upload = async (file: File) => {
    setUploading(file.name);
    try {
      const p = await api<{ attachmentId: string; uploadUrl: string; headers: Record<string, string> }>("/api/attachments", {
        body: { fileName: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size, labId: lab.id },
      });
      const put = await fetch(p.uploadUrl, { method: "PUT", headers: p.headers, body: file });
      if (!put.ok) throw new Error(`Upload to storage failed (${put.status})`);
      await api(`/api/attachments/${p.attachmentId}`, { method: "POST" });
      setAttachments((a) => [...a, { id: p.attachmentId, fileName: file.name, mimeType: file.type }]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };
  const openAttachment = async (id: string) => {
    const r = await api<{ url: string }>(`/api/attachments/${id}`);
    window.open(r.url, "_blank", "noopener");
  };

  const caseHref = `/troubleshooting/new?lab=${lab.id}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Link href="/labs" className="hover:text-foreground">Hands-On Labs</Link>
          <span>/</span>
          <span className="truncate">{lab.title}</span>
          <span className="ml-auto"><SaveIndicator state={saver.state} error={saver.error} /></span>
        </div>
        <input
          aria-label="Lab title"
          value={lab.title}
          onChange={(e) => set("title", e.target.value)}
          className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Status" value={lab.status} onChange={(e) => set("status", e.target.value as LabData["status"])} className="h-8 text-xs">
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select aria-label="Topic" value={lab.topicId ?? ""} onChange={(e) => set("topicId", e.target.value || null)} className="h-8 max-w-[220px] text-xs">
            <option value="">No topic</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </Select>
          <Select aria-label="Architecture" value={lab.diagramId ?? ""} onChange={(e) => set("diagramId", e.target.value || null)} className="h-8 max-w-[220px] text-xs">
            <option value="">No architecture</option>
            {diagrams.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </Select>
          <Badge variant="outline">Steps {done}/{lab.steps.length}</Badge>
          <Badge variant="outline">Checks {checks}/{lab.checklist.length}</Badge>
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" variant="outline" asChild><Link href={caseHref}><Siren /> Log a troubleshooting case</Link></Button>
            <Button size="sm" variant="ghost" onClick={remove} aria-label="Delete lab"><Trash2 /></Button>
          </div>
        </div>
      </div>

      <Card className="grid gap-4 p-5 md:grid-cols-2">
        <Area label="Objective" value={lab.objective} onChange={(v) => set("objective", v)} />
        <Area label="Prerequisites" value={lab.prerequisites} onChange={(v) => set("prerequisites", v)} />
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Estimated AWS cost</span>
          <Input value={lab.estimatedCost ?? ""} onChange={(e) => set("estimatedCost", e.target.value || null)} placeholder="e.g. ≈ $0.05/hour, delete the same day" />
          <span className="block text-xs text-muted-foreground">Estimate only. Check the AWS Pricing Calculator for your region.</span>
        </label>
        <Area label="Expected results" value={lab.expectedResults} onChange={(v) => set("expectedResults", v)} />
      </Card>

      <ArchitecturePanel diagramId={lab.diagramId} conceptId={conceptId} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Implementation steps</h2>
          <Button size="sm" variant="outline" onClick={() => set("steps", [...lab.steps, { title: "New step", instruction: "", commands: "", expected: "", actual: "", done: false }])}>
            <Plus /> Add step
          </Button>
        </div>
        {lab.steps.map((s, i) => (
          <Card key={i} className={cn("space-y-3 p-4", s.done && "border-emerald-500/40")}>
            <div className="flex items-center gap-2">
              <button type="button" aria-label={s.done ? "Mark step not done" : "Mark step done"} onClick={() => setStep(i, { done: !s.done })}>
                {s.done ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Circle className="size-5 text-muted-foreground" />}
              </button>
              <span className="text-sm tabular-nums text-muted-foreground">{i + 1}.</span>
              <input aria-label={`Step ${i + 1} title`} value={s.title} onChange={(e) => setStep(i, { title: e.target.value })} className="min-w-0 flex-1 bg-transparent font-medium outline-none" />
              <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => moveStep(i, -1)}><ArrowUp /></Button>
              <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === lab.steps.length - 1} onClick={() => moveStep(i, 1)}><ArrowDown /></Button>
              <Button size="icon-sm" variant="ghost" aria-label="Delete step" onClick={() => set("steps", lab.steps.filter((_, j) => j !== i))}><Trash2 /></Button>
            </div>
            <Area label="Instruction" value={s.instruction} onChange={(v) => setStep(i, { instruction: v })} rows={2} />
            <div className="relative">
                <Area label="Commands" value={s.commands} onChange={(v) => setStep(i, { commands: v })} mono rows={2} hint="Shown for reference only. Nothing here is executed by the app." />
                {s.commands ? (
                  <button type="button" title="Copy commands" className="absolute right-2 top-7 rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => navigator.clipboard.writeText(s.commands)}>
                    <Copy className="size-3.5" />
                  </button>
                ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Area label="Expected" value={s.expected} onChange={(v) => setStep(i, { expected: v })} rows={2} />
              <Area label="What actually happened" value={s.actual} onChange={(v) => setStep(i, { actual: v })} rows={2} placeholder="Output, surprises, screenshots taken…" />
            </div>
          </Card>
        ))}
        {!lab.steps.length ? <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No steps yet.</p> : null}
      </section>

      <Card className="space-y-4 p-5">
        <h2 className="text-lg font-semibold">What happened</h2>
        <Area label="Actual observations" value={lab.observations} onChange={(v) => set("observations", v)} />
        <Area label="Errors encountered" value={lab.errorsEncountered} onChange={(v) => set("errorsEncountered", v)} mono placeholder="Paste exact error messages and CLI output; they are searchable." />
        <div className="grid gap-4 md:grid-cols-2">
          <Area label="Root cause" value={lab.rootCause} onChange={(v) => set("rootCause", v)} />
          <Area label="Resolution" value={lab.resolution} onChange={(v) => set("resolution", v)} />
        </div>
        {lab.cases.length ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Troubleshooting cases:</span>
            {lab.cases.map((c) => <Link key={c.id} href={`/troubleshooting/${c.id}`} className="rounded-md border px-2 py-0.5 hover:bg-muted">{c.title}</Link>)}
          </div>
        ) : null}
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Validation checklist</h2>
          <Button size="sm" variant="outline" onClick={() => set("checklist", [...lab.checklist, { text: "New check", done: false }])}><Plus /> Add check</Button>
        </div>
        <ul className="space-y-1.5">
          {lab.checklist.map((c, i) => (
            <li key={i} className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-primary" checked={c.done} aria-label={c.text} onChange={() => set("checklist", lab.checklist.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} />
              <input value={c.text} onChange={(e) => set("checklist", lab.checklist.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} className={cn("min-w-0 flex-1 bg-transparent text-sm outline-none", c.done && "text-muted-foreground line-through")} />
              <Button size="icon-sm" variant="ghost" aria-label="Remove check" onClick={() => set("checklist", lab.checklist.filter((_, j) => j !== i))}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-4 p-5">
        <Area label="Terraform files" value={lab.terraform} onChange={(v) => set("terraform", v)} mono rows={4} placeholder={'resource "aws_instance" "web" {\n  ...\n}'} hint="Reference only. The app never runs terraform plan/apply." />
        <Area label="Cleanup instructions" value={lab.cleanup} onChange={(v) => set("cleanup", v)} hint="Do these before you forget; idle load balancers, NAT gateways and EKS clusters keep billing." />
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Screenshots and files</h2>
          <label className={cn("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs hover:bg-accent", uploading && "pointer-events-none opacity-60")}>
            <ImagePlus className="size-4" /> {uploading ? `Uploading ${uploading}…` : "Upload"}
            <input type="file" className="sr-only" accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.log,.json,.md" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        </div>
        {attachments.length ? (
          <ul className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => openAttachment(a.id)} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm hover:bg-muted">
                  <Paperclip className="size-3.5" /> {a.fileName}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Files go to your private S3 bucket through short-lived presigned URLs.</p>
        )}
      </Card>
    </div>
  );
}

function ArchitecturePanel({ diagramId, conceptId }: { diagramId: string | null; conceptId?: string }) {
  const ref = diagramId ? { kind: "diagram" as const, id: diagramId } : conceptId ? { kind: "concept" as const, id: conceptId } : null;
  const [memo, setMemo] = useState(ref);
  if ((memo?.id ?? null) !== (ref?.id ?? null)) setMemo(ref);
  const { graph, title } = useDiagramGraph(memo);
  if (!ref) return null;
  const href = ref.kind === "diagram" ? `/studio/${ref.id}` : `/studio/concepts/${ref.id}`;
  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center gap-2 text-sm">
        <h2 className="font-semibold">Architecture</h2>
        <span className="text-muted-foreground">{title}{ref.kind === "concept" ? " (concept)" : ""}</span>
        <Link href={href} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Open <ExternalLink className="size-3" /></Link>
        <Link href={`/flows?${ref.kind}=${ref.id}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Animate <ExternalLink className="size-3" /></Link>
      </div>
      {graph ? <div className="overflow-hidden rounded-lg border bg-muted/20"><DiagramCanvas graph={graph} height={360} /></div> : <div className="h-40 animate-pulse rounded-lg bg-muted/40" />}
    </Card>
  );
}
