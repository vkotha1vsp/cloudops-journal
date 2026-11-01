"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getNodesBounds, getViewportForBounds, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import {
  AlertTriangle, CheckCircle2, Download, FileText, Info, LayoutGrid, PanelLeft, PanelRight, Play, Plus, Redo2, Save, Search, Sparkles, Trash2, Undo2, Wand2,
} from "lucide-react";
import { paletteFor, service } from "@/domain/architecture/catalog";
import { RELATIONS, validateGraph, type ArchGraph, type Boundary, type BoundaryKind } from "@/domain/architecture/graph";
import { generate, type GenerateResult } from "@/domain/architecture/build";
import { parseRequest } from "@/domain/architecture/parse";
import { autoLayout } from "@/domain/architecture/layout";
import { toMermaid } from "@/domain/architecture/export";
import { RELATION_INFO } from "@/domain/architecture/relations";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/client";
import { cn, relativeTime } from "@/lib/utils";
import { DiagramCanvas, type Selection } from "./diagram-canvas";
import { FlowPlayer } from "./flow-player";

export type StudioInitial = {
  id?: string;
  title: string;
  description: string;
  provider: "aws" | "azure";
  topicId: string | null;
  graph: ArchGraph;
  assumptions: string[];
  questions?: string[];
  added?: GenerateResult["added"];
  currentVersion?: number;
  versions?: { version: number; note: string | null; createdAt: string }[];
  pages?: { id: string; title: string }[];
};

type Topic = { id: string; title: string; group: string };

function download(name: string, data: string, type: string) {
  const a = document.createElement("a");
  a.href = data.startsWith("data:") ? data : URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "diagram";
}

export function StudioEditor(props: { initial: StudioInitial; topics: Topic[] }) {
  return (
    <ReactFlowProvider>
      <StudioInner {...props} />
    </ReactFlowProvider>
  );
}

function StudioInner({ initial, topics }: { initial: StudioInitial; topics: Topic[] }) {
  const router = useRouter();
  const rf = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [id, setId] = useState(initial.id);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [provider, setProvider] = useState(initial.provider);
  const [topicId, setTopicId] = useState(initial.topicId);
  const [graph, setGraph] = useState(initial.graph);
  const [past, setPast] = useState<ArchGraph[]>([]);
  const [future, setFuture] = useState<ArchGraph[]>([]);
  const dragStart = useRef<ArchGraph | null>(null);
  const [meta, setMeta] = useState({ assumptions: initial.assumptions, questions: initial.questions ?? [], added: initial.added ?? [] });
  const [selection, setSelection] = useState<Selection>(null);
  const [view, setView] = useState<"edit" | "animate">("edit");
  const [version, setVersion] = useState(initial.currentVersion ?? 0);
  const [versions, setVersions] = useState(initial.versions ?? []);
  const [dirty, setDirty] = useState(!initial.id);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nl, setNl] = useState("");
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [pageTopic, setPageTopic] = useState(initial.topicId ?? "");
  const [showLeft, setShowLeft] = useState(!initial.graph.nodes.length);
  const [showRight, setShowRight] = useState(true);

  const validation = useMemo(() => validateGraph(graph), [graph]);
  const errors = validation.filter((v) => v.level === "error");
  const warnings = validation.filter((v) => v.level === "warning");

  const apply = useCallback(
    (next: ArchGraph, commit = true) => {
      if (!commit) {
        if (!dragStart.current) dragStart.current = graph;
        setGraph(next);
        return;
      }
      const before = dragStart.current ?? graph;
      dragStart.current = null;
      setPast((p) => [...p.slice(-99), before]);
      setFuture([]);
      setGraph(next);
      setDirty(true);
    },
    [graph],
  );
  const undo = () => {
    const prev = past.at(-1);
    if (!prev) return;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [graph, ...f]);
    setGraph(prev);
    setDirty(true);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, graph]);
    setGraph(next);
    setDirty(true);
  };

  const runGenerate = (r: GenerateResult, prov: "aws" | "azure") => {
    if (graph.nodes.length && !window.confirm("Replace the current diagram with the generated one? (Undo brings it back.)")) return;
    setProvider(prov);
    apply(r.graph);
    setMeta({ assumptions: r.assumptions, questions: r.questions, added: r.added });
    setSelection(null);
    setTimeout(() => rf.fitView({ padding: 0.12, duration: 400 }), 50);
  };
  const generateFromText = () => {
    if (!nl.trim()) return;
    const parsed = parseRequest(nl);
    if (!Object.keys(parsed.services).length) {
      setStatus("No services recognised. Try names like Route 53, ALB, EC2, RDS, S3, Lambda, Front Door…");
      return;
    }
    runGenerate(generate(parsed), parsed.provider);
    if (!title || title === "Untitled architecture") setTitle(nl.slice(0, 80));
    setShowLeft(false);
  };
  const generateFromPalette = () => {
    if (!Object.keys(picked).length) return;
    runGenerate(generate({ provider, services: picked }), provider);
    setShowLeft(false);
  };

  const addService = (kind: string) => {
    const def = service(kind);
    let n = 1;
    while (graph.nodes.some((x) => x.key === `${kind}-${n}`)) n++;
    const maxX = Math.max(0, ...graph.nodes.map((x) => x.x ?? 0));
    const key = `${kind}-${n}`;
    apply({ ...graph, nodes: [...graph.nodes, { key, kind, role: def.role, label: `${def.label}${n > 1 ? ` ${n}` : ""}`, x: maxX + 290, y: 0, config: {} }] });
    setSelection({ type: "node", key });
    setTimeout(() => rf.fitView({ padding: 0.12, duration: 300 }), 50);
  };

  const selectedNode = selection?.type === "node" ? graph.nodes.find((n) => n.key === selection.key) : undefined;
  const selectedEdge = selection?.type === "edge" ? graph.edges.find((e) => e.key === selection.key) : undefined;
  const updateNode = (patch: Partial<ArchGraph["nodes"][number]>) =>
    selectedNode && apply({ ...graph, nodes: graph.nodes.map((n) => (n.key === selectedNode.key ? { ...n, ...patch } : n)) });
  const updateEdge = (patch: Partial<ArchGraph["edges"][number]>) =>
    selectedEdge && apply({ ...graph, edges: graph.edges.map((e) => (e.key === selectedEdge.key ? { ...e, ...patch } : e)) });
  const deleteSelection = () => {
    if (selectedNode) apply({ ...graph, nodes: graph.nodes.filter((n) => n.key !== selectedNode.key), edges: graph.edges.filter((e) => e.source !== selectedNode.key && e.target !== selectedNode.key) });
    if (selectedEdge) apply({ ...graph, edges: graph.edges.filter((e) => e.key !== selectedEdge.key) });
    setSelection(null);
  };

  const addBoundary = (kind: BoundaryKind) => {
    const parentKinds: Record<BoundaryKind, BoundaryKind[]> = { region: [], vpc: ["region"], az: ["vpc"], "subnet-public": ["az", "vpc"], "subnet-private": ["az", "vpc"] };
    const parent = graph.boundaries.find((b) => parentKinds[kind].includes(b.kind));
    const label = window.prompt(`Name for the new ${kind.replace("-", " ")}`, kind === "region" ? "Region us-east-1" : kind === "vpc" ? "VPC 10.0.0.0/16" : kind === "az" ? "us-east-1a" : "Subnet 10.0.0.0/24");
    if (!label) return;
    let n = 1;
    while (graph.boundaries.some((b) => b.id === `${kind}-${n}`)) n++;
    const b: Boundary = { id: `${kind}-${n}`, kind, label, parentId: parent?.id };
    const next = { ...graph, boundaries: [...graph.boundaries, b] };
    if (selectedNode) next.nodes = next.nodes.map((x) => (x.key === selectedNode.key ? { ...x, boundaryId: b.id } : x));
    apply(next);
    setStatus(selectedNode ? `Created ${label} and moved ${selectedNode.label} into it.` : `Created ${label}. Select a resource and choose it under “Inside” to place it there (empty boxes are hidden).`);
  };
  const removeBoundary = (b: Boundary) => {
    apply({
      ...graph,
      boundaries: graph.boundaries.filter((x) => x.id !== b.id).map((x) => (x.parentId === b.id ? { ...x, parentId: b.parentId } : x)),
      nodes: graph.nodes.map((n) => (n.boundaryId === b.id ? { ...n, boundaryId: b.parentId } : n)),
    });
  };

  const payload = (note?: string) => ({
    title: title.trim() || "Untitled architecture",
    description: description || undefined,
    provider,
    topicId: topicId || null,
    graph,
    assumptions: meta.assumptions,
    note,
    expectedVersion: id ? version : undefined,
  });
  const save = async (note?: string): Promise<string | undefined> => {
    setBusy(true);
    setStatus(null);
    try {
      if (!id) {
        const r = await api<{ id: string; version: number }>("/api/diagrams", { body: payload(note ?? "Created") });
        setId(r.id);
        setVersion(r.version);
        setDirty(false);
        router.replace(`/studio/${r.id}`);
        setStatus("Saved as version 1.");
        return r.id;
      }
      const r = await api<{ version: number }>(`/api/diagrams/${id}`, { method: "PUT", body: payload(note) });
      setVersion(r.version);
      setVersions((v) => [{ version: r.version, note: note ?? `Version ${r.version}`, createdAt: new Date().toISOString() }, ...v]);
      setDirty(false);
      setStatus(`Saved version ${r.version}.`);
      return id;
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed");
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  const saveVersion = async () => {
    const note = window.prompt("Describe this version (optional)", "");
    if (note === null) return;
    await save(note || undefined);
  };
  const loadVersion = async (v: number) => {
    if (!id) return;
    const r = await api<{ version: { graph: ArchGraph } }>(`/api/diagrams/${id}/versions/${v}`);
    apply(r.version.graph);
    setStatus(`Loaded version ${v} into the editor. Save to keep it as the newest version.`);
    setTimeout(() => rf.fitView({ padding: 0.12, duration: 300 }), 50);
  };
  const saveAsPage = async () => {
    const diagramId = dirty || !id ? await save() : id;
    if (!diagramId) return;
    setBusy(true);
    try {
      const r = await api<{ page: { id: string } }>(`/api/diagrams/${diagramId}/page`, { body: { topicId: pageTopic || null, title: title } });
      router.push(`/journal/${r.page.id}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not create the page");
      setBusy(false);
    }
  };

  const exportImage = async (kind: "png" | "svg") => {
    const el = canvasRef.current?.querySelector<HTMLElement>(".react-flow__viewport");
    if (!el) return;
    const nodes = rf.getNodes();
    const bounds = getNodesBounds(nodes);
    const width = Math.min(4000, Math.max(800, bounds.width + 160));
    const height = Math.min(4000, Math.max(500, bounds.height + 160));
    const vp = getViewportForBounds(bounds, width, height, 0.2, 2, 0.06);
    const bg = getComputedStyle(document.body).backgroundColor;
    const opts = { backgroundColor: bg, width, height, style: { width: `${width}px`, height: `${height}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` } };
    const data = kind === "png" ? await toPng(el, { ...opts, pixelRatio: 2 }) : await toSvg(el, opts);
    download(`${slug(title)}.${kind}`, data, kind === "png" ? "image/png" : "image/svg+xml");
  };

  const palette = paletteFor(provider).filter((s) => !q || `${s.label} ${s.category} ${s.aliases.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  const categories = [...new Set(palette.map((s) => s.category))];

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[640px] flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/studio" className="text-sm text-muted-foreground hover:text-foreground">Studio</Link>
        <span className="text-muted-foreground">/</span>
        <input
          value={title}
          onChange={(e) => (setTitle(e.target.value), setDirty(true))}
          aria-label="Diagram title"
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold focus:outline-none"
        />
        <span className="text-xs text-muted-foreground" role="status">
          {status ?? (id ? `v${version}${dirty ? " · unsaved changes" : " · saved"}` : "Not saved yet")}
        </span>
        <div className="flex items-center rounded-lg border p-0.5">
          <Button size="sm" variant={view === "edit" ? "secondary" : "ghost"} onClick={() => setView("edit")}><LayoutGrid /> Edit</Button>
          <Button size="sm" variant={view === "animate" ? "secondary" : "ghost"} onClick={() => setView("animate")} disabled={!graph.nodes.length}><Play /> Animate</Button>
        </div>
        <Button size="icon-sm" variant={showLeft ? "secondary" : "ghost"} aria-label="Toggle create panel" title="Create panel" onClick={() => setShowLeft(!showLeft)}><PanelLeft /></Button>
        <Button size="icon-sm" variant={showRight ? "secondary" : "ghost"} aria-label="Toggle inspector panel" title="Inspector panel" onClick={() => setShowRight(!showRight)}><PanelRight /></Button>
        <Button size="icon-sm" variant="ghost" aria-label="Undo" title="Undo" onClick={undo} disabled={!past.length}><Undo2 /></Button>
        <Button size="icon-sm" variant="ghost" aria-label="Redo" title="Redo" onClick={redo} disabled={!future.length}><Redo2 /></Button>
        <Button size="sm" variant="outline" onClick={() => (apply(autoLayout(graph)), setTimeout(() => rf.fitView({ padding: 0.12, duration: 300 }), 50))} disabled={!graph.nodes.length}>
          <Wand2 /> Auto-layout
        </Button>
        <Button size="sm" onClick={() => (id ? saveVersion() : save())} disabled={busy || !graph.nodes.length}><Save /> {id ? "Save version" : "Save"}</Button>
      </div>

      {view === "animate" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <FlowPlayer graph={graph} height={600} />
        </div>
      ) : (
        <div
          className="grid min-h-0 flex-1 gap-3"
          style={{ gridTemplateColumns: [showLeft ? "270px" : null, "minmax(0,1fr)", showRight ? "300px" : null].filter(Boolean).join(" ") }}
        >
          {/* Left: create */}
          <aside className={cn("min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border bg-card p-3", showLeft ? "flex" : "hidden")}>
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="size-4 text-primary" /> Describe it</h3>
              <Textarea
                value={nl}
                onChange={(e) => setNl(e.target.value)}
                rows={4}
                placeholder="e.g. Route 53, an Application Load Balancer, Target Group, two EC2 instances, Security Groups and RDS"
                className="text-xs"
              />
              <Button size="sm" className="w-full" onClick={generateFromText} disabled={!nl.trim()}>Generate from description</Button>
            </section>
            <hr />
            <section className="flex min-h-0 flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Or pick services</h3>
                <Select value={provider} onChange={(e) => (setProvider(e.target.value as "aws" | "azure"), setPicked({}))} className="h-7 text-xs" aria-label="Cloud provider">
                  <option value="aws">AWS</option>
                  <option value="azure">Azure</option>
                </Select>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services" className="h-8 pl-7 text-xs" />
              </div>
              <div className="space-y-2">
                {categories.map((cat) => (
                  <div key={cat}>
                    <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{cat}</div>
                    {palette.filter((s) => s.category === cat).map((s) => (
                      <div key={s.kind} className="flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-muted">
                        <input
                          type="checkbox"
                          aria-label={`Select ${s.label}`}
                          checked={Boolean(picked[s.kind])}
                          onChange={(e) => setPicked((p) => { const n = { ...p }; if (e.target.checked) n[s.kind] = 1; else delete n[s.kind]; return n; })}
                        />
                        <span className="grid h-5 min-w-5 place-items-center rounded px-0.5 text-[8px] font-bold text-white" style={{ background: s.color }}>{s.short}</span>
                        <span className="flex-1 truncate text-xs" title={s.description}>{s.label}</span>
                        {picked[s.kind] && ["ec2", "ecs", "vm"].includes(s.kind) ? (
                          <input type="number" min={1} max={8} value={picked[s.kind]} aria-label={`How many ${s.label}`}
                            onChange={(e) => setPicked((p) => ({ ...p, [s.kind]: Math.max(1, Math.min(8, Number(e.target.value) || 1)) }))}
                            className="h-6 w-10 rounded border bg-background px-1 text-xs" />
                        ) : null}
                        <button type="button" title={`Add ${s.label} to the canvas`} aria-label={`Add ${s.label} to the canvas`} onClick={() => addService(s.kind)} className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground">
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <Button size="sm" className="sticky bottom-0 w-full" onClick={generateFromPalette} disabled={!Object.keys(picked).length}>
                Generate architecture ({Object.keys(picked).length})
              </Button>
            </section>
          </aside>

          {/* Centre: canvas */}
          <div ref={canvasRef} className="relative min-h-0 overflow-hidden rounded-xl border bg-muted/20">
            {graph.nodes.length ? (
              <DiagramCanvas graph={graph} editable validation={validation} selection={selection} onSelect={setSelection} onChange={apply} height="100%" />
            ) : (
              <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground" onClick={() => setShowLeft(true)}>
                <div className="max-w-sm space-y-2">
                  <p className="text-base font-medium text-foreground">Start an architecture</p>
                  <p>Describe it in words, or tick services on the left and press Generate. The generator places each service where it belongs and wires it the way AWS and Azure actually work.</p>
                  <p>Use <b>+</b> to drop single services onto the canvas, then drag between their edges to connect them.</p>
                </div>
              </div>
            )}
          </div>

          {/* Right: inspect */}
          <aside className={cn("min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border bg-card p-3 text-sm", showRight ? "flex" : "hidden")}>
            {selectedNode ? (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{service(selectedNode.kind).label}</h3>
                  <Button size="icon-sm" variant="ghost" aria-label="Delete resource" onClick={deleteSelection}><Trash2 /></Button>
                </div>
                <p className="text-xs text-muted-foreground">{service(selectedNode.kind).description}</p>
                <label className="block text-xs font-medium">Label
                  <Input value={selectedNode.label} onChange={(e) => updateNode({ label: e.target.value })} className="mt-1 h-8" />
                </label>
                <label className="block text-xs font-medium">Inside
                  <Select value={selectedNode.boundaryId ?? ""} onChange={(e) => updateNode({ boundaryId: e.target.value || undefined })} className="mt-1 w-full">
                    <option value="">Nothing (global / outside)</option>
                    {graph.boundaries.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                  </Select>
                </label>
                {["ec2", "ecs", "eks", "vm", "vmss"].includes(selectedNode.kind) ? (
                  <label className="block text-xs font-medium">App port
                    <Input type="number" value={Number(selectedNode.config?.port ?? 80)} onChange={(e) => updateNode({ config: { ...selectedNode.config, port: Number(e.target.value) } })} className="mt-1 h-8" />
                  </label>
                ) : null}
              </section>
            ) : selectedEdge ? (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Connection</h3>
                  <Button size="icon-sm" variant="ghost" aria-label="Delete connection" onClick={deleteSelection}><Trash2 /></Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {graph.nodes.find((n) => n.key === selectedEdge.source)?.label} → {graph.nodes.find((n) => n.key === selectedEdge.target)?.label}
                </p>
                <label className="block text-xs font-medium">Relationship
                  <Select value={selectedEdge.relation} onChange={(e) => updateEdge({ relation: e.target.value })} className="mt-1 w-full">
                    {RELATIONS.map((r) => <option key={r} value={r}>{r} ({RELATION_INFO[r]?.label})</option>)}
                  </Select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-medium">Protocol
                    <Input value={selectedEdge.protocol ?? ""} onChange={(e) => updateEdge({ protocol: e.target.value || undefined })} placeholder="HTTPS" className="mt-1 h-8" />
                  </label>
                  <label className="block text-xs font-medium">Port
                    <Input type="number" value={selectedEdge.port ?? ""} onChange={(e) => updateEdge({ port: e.target.value ? Number(e.target.value) : undefined })} placeholder="443" className="mt-1 h-8" />
                  </label>
                </div>
                <label className="block text-xs font-medium">Label
                  <Input value={selectedEdge.label ?? ""} onChange={(e) => updateEdge({ label: e.target.value || undefined })} className="mt-1 h-8" />
                </label>
              </section>
            ) : (
              <p className="text-xs text-muted-foreground">Select a resource or a connection to edit it. Delete removes the selection.</p>
            )}

            <section className="space-y-1.5">
              <h3 className="flex items-center gap-1.5 font-semibold">
                {errors.length ? <AlertTriangle className="size-4 text-red-500" /> : <CheckCircle2 className="size-4 text-emerald-500" />}
                Validation
              </h3>
              {errors.length + warnings.length === 0 ? <p className="text-xs text-muted-foreground">No problems found.</p> : null}
              {[...errors, ...warnings].map((v, i) => (
                <p key={i} className={cn("rounded-md px-2 py-1 text-xs", v.level === "error" ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-300")}>
                  <b>{v.level === "error" ? "Error" : "Warning"}:</b> {v.message}
                </p>
              ))}
            </section>

            {meta.questions.length || meta.added.length || meta.assumptions.length || validation.some((v) => v.level === "assumption") ? (
              <section className="space-y-1.5">
                <h3 className="flex items-center gap-1.5 font-semibold"><Info className="size-4 text-sky-500" /> Assumptions</h3>
                {meta.questions.map((x) => <p key={x} className="rounded-md bg-sky-500/10 px-2 py-1 text-xs"><b>Question:</b> {x}</p>)}
                {meta.added.map((a) => <p key={a.kind} className="text-xs"><b>Added {service(a.kind).label}:</b> {a.reason}</p>)}
                {[...meta.assumptions, ...validation.filter((v) => v.level === "assumption").map((v) => v.message)].map((x) => (
                  <p key={x} className="text-xs text-muted-foreground">• {x}</p>
                ))}
              </section>
            ) : null}

            <section className="space-y-1.5">
              <h3 className="font-semibold">Boundaries</h3>
              {graph.boundaries.map((b) => (
                <div key={b.id} className="flex items-center gap-1 text-xs">
                  <span className="w-16 shrink-0 text-muted-foreground">{b.kind.replace("subnet-", "")}</span>
                  <input className="min-w-0 flex-1 bg-transparent focus:outline-none" value={b.label} aria-label={`Rename ${b.label}`}
                    onChange={(e) => apply({ ...graph, boundaries: graph.boundaries.map((x) => (x.id === b.id ? { ...x, label: e.target.value } : x)) })} />
                  <button aria-label={`Remove ${b.label}`} onClick={() => removeBoundary(b)} className="text-muted-foreground hover:text-foreground"><Trash2 className="size-3.5" /></button>
                </div>
              ))}
              <div className="flex flex-wrap gap-1">
                {(["region", "vpc", "az", "subnet-public", "subnet-private"] as BoundaryKind[]).map((k) => (
                  <button key={k} onClick={() => addBoundary(k)} className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">+ {k.replace("subnet-", "")}</button>
                ))}
              </div>
            </section>

            <section className="space-y-1.5">
              <h3 className="font-semibold">Details</h3>
              <Textarea value={description} onChange={(e) => (setDescription(e.target.value), setDirty(true))} rows={2} placeholder="What this architecture is for" className="text-xs" />
              <Select value={topicId ?? ""} onChange={(e) => (setTopicId(e.target.value || null), setDirty(true))} className="w-full text-xs" aria-label="Linked topic">
                <option value="">Not linked to a topic</option>
                {[...new Set(topics.map((t) => t.group))].map((g) => (
                  <optgroup key={g} label={g}>{topics.filter((t) => t.group === g).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</optgroup>
                ))}
              </Select>
            </section>

            <section className="space-y-1.5">
              <h3 className="font-semibold">Save as journal page</h3>
              <Select value={pageTopic} onChange={(e) => setPageTopic(e.target.value)} className="w-full text-xs" aria-label="Topic for the page">
                <option value="">Choose a learning topic…</option>
                {[...new Set(topics.map((t) => t.group))].map((g) => (
                  <optgroup key={g} label={g}>{topics.filter((t) => t.group === g).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</optgroup>
                ))}
              </Select>
              <Button size="sm" variant="outline" className="w-full" onClick={saveAsPage} disabled={busy || !graph.nodes.length}>
                <FileText /> Create page with diagram + explanation
              </Button>
              {initial.pages?.length ? (
                <p className="text-xs text-muted-foreground">Pages: {initial.pages.map((p) => <Link key={p.id} href={`/journal/${p.id}`} className="mr-2 underline">{p.title}</Link>)}</p>
              ) : null}
            </section>

            <section className="space-y-1.5">
              <h3 className="font-semibold">Export</h3>
              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" variant="outline" onClick={() => exportImage("png")} disabled={!graph.nodes.length}><Download /> PNG</Button>
                <Button size="sm" variant="outline" onClick={() => exportImage("svg")} disabled={!graph.nodes.length}><Download /> SVG</Button>
                <Button size="sm" variant="outline" onClick={() => download(`${slug(title)}.json`, JSON.stringify({ title, provider, description, assumptions: meta.assumptions, graph }, null, 2), "application/json")} disabled={!graph.nodes.length}><Download /> JSON</Button>
                <Button size="sm" variant="outline" onClick={() => download(`${slug(title)}.mmd`, toMermaid(graph), "text/plain")} disabled={!graph.nodes.length}><Download /> Mermaid</Button>
              </div>
            </section>

            {versions.length ? (
              <section className="space-y-1">
                <h3 className="font-semibold">Versions</h3>
                {versions.map((v) => (
                  <button key={v.version} onClick={() => loadVersion(v.version)} className={cn("flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-xs hover:bg-muted", v.version === version && "bg-accent")}>
                    <span>v{v.version} · {v.note ?? "Saved"}</span>
                    <span className="text-muted-foreground">{relativeTime(v.createdAt)}</span>
                  </button>
                ))}
              </section>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
