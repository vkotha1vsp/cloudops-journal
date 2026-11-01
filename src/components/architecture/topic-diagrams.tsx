"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";
import { conceptGraph } from "@/domain/architecture/library";
import type { ArchGraph } from "@/domain/architecture/graph";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DiagramCanvas } from "./diagram-canvas";
import { FlowPlayer } from "./flow-player";

export type DiagramRef = { kind: "concept" | "diagram"; id: string; title: string };

/** Loads a concept (from code) or a saved diagram (from the API). */
export function useDiagramGraph(ref: { kind: "concept" | "diagram"; id: string } | null) {
  const [state, setState] = useState<{ graph: ArchGraph | null; title?: string; error?: string }>({ graph: null });
  useEffect(() => {
    if (!ref) return;
    if (ref.kind === "concept") {
      const c = conceptGraph(ref.id);
      setState(c ? { graph: c.graph, title: c.concept.title } : { graph: null, error: "Concept not found" });
      return;
    }
    let live = true;
    setState({ graph: null });
    api<{ diagram: { graph: ArchGraph; title: string } }>(`/api/diagrams/${ref.id}`)
      .then((r) => live && setState({ graph: r.diagram.graph, title: r.diagram.title }))
      .catch((e: Error) => live && setState({ graph: null, error: e.message }));
    return () => {
      live = false;
    };
  }, [ref?.kind, ref?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

export function TopicDiagrams({ items, mode, topicId }: { items: DiagramRef[]; mode: "diagram" | "flow"; topicId: string }) {
  const [current, setCurrent] = useState(0);
  const ref = items[current] ?? null;
  const memoRef = useMemo(() => (ref ? { kind: ref.kind, id: ref.id } : null), [ref?.kind, ref?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const { graph, error } = useDiagramGraph(memoRef);

  if (!items.length)
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <span>No architecture for this topic yet.</span>
        <Button size="sm" variant="outline" asChild><Link href={`/studio/new?topic=${topicId}`}><Plus /> Create one in Studio</Link></Button>
      </div>
    );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <button key={`${it.kind}:${it.id}`} onClick={() => setCurrent(i)}
            className={cn("rounded-md border px-2.5 py-1 text-xs", i === current ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
            {it.kind === "concept" ? "Concept · " : ""}{it.title}
          </button>
        ))}
        {ref ? (
          <Link href={ref.kind === "concept" ? `/studio/concepts/${ref.id}` : `/studio/${ref.id}`} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Open in Studio <ExternalLink className="size-3" />
          </Link>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {graph ? (
        mode === "diagram" ? (
          <div className="overflow-hidden rounded-xl border bg-muted/20"><DiagramCanvas graph={graph} height={460} /></div>
        ) : (
          <FlowPlayer graph={graph} height={440} compact />
        )
      ) : !error ? <div className="h-[200px] animate-pulse rounded-xl bg-muted/40" /> : null}
    </div>
  );
}
