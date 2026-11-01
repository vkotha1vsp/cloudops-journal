"use client";

import { memo } from "react";
import {
  BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Handle, MarkerType, Position,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from "@xyflow/react";
import { service } from "@/domain/architecture/catalog";
import type { ArchEdge, ArchGraph, ArchNode, Boundary } from "@/domain/architecture/graph";
import { boundaryRects, NODE_H, NODE_W, type Rect } from "@/domain/architecture/layout";
import { RELATION_INFO } from "@/domain/architecture/relations";
import type { Outcome } from "@/domain/architecture/scenarios";
import { cn } from "@/lib/utils";

export type HighlightState = "none" | "active" | "dim" | Outcome;

export type ServiceNodeData = { node: ArchNode; state: HighlightState; issue?: "error" | "warning" };
export type BoundaryNodeData = { boundary: Boundary; rect: Rect };
export type RelationEdgeData = { edge: ArchEdge; state: HighlightState; issue?: boolean };

const OUTCOME_COLOR: Record<string, string> = {
  active: "#0ea5e9", OK: "#0ea5e9", FAILED: "#dc2626", REJECTED: "#ea580c", FAILOVER: "#7c3aed",
};

const handle = "!h-2 !w-2 !border-0 !bg-slate-400 opacity-0 group-hover:opacity-100";

export const ServiceNode = memo(function ServiceNode({ data, selected }: NodeProps<Node<ServiceNodeData>>) {
  const def = service(data.node.kind);
  const ring = data.state !== "none" && data.state !== "dim" ? OUTCOME_COLOR[data.state] : undefined;
  return (
    <div
      className={cn(
        "group relative flex items-center gap-2.5 rounded-xl border bg-card px-3 shadow-sm transition-all duration-300",
        selected && "ring-2 ring-primary",
        data.state === "dim" && "opacity-35",
        data.issue === "error" && "border-red-500",
        data.issue === "warning" && "border-amber-500",
      )}
      style={{ width: NODE_W, height: NODE_H, boxShadow: ring ? `0 0 0 3px ${ring}, 0 0 24px ${ring}66` : undefined }}
      title={def.description}
    >
      <span className="grid h-10 min-w-10 shrink-0 place-items-center rounded-lg px-1 text-[11px] font-bold text-white" style={{ background: def.color }}>
        {def.short}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="line-clamp-2 block text-[12.5px] font-medium text-foreground">{data.node.label}</span>
        <span className="block truncate text-[10.5px] text-muted-foreground">{def.label}</span>
      </span>
      {ring && data.state !== "OK" && data.state !== "active" ? (
        <span className="absolute -right-2 -top-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: ring }}>
          {data.state === "FAILED" ? "FAIL" : data.state === "REJECTED" ? "DROP" : "FAILOVER"}
        </span>
      ) : null}
      {(["Left", "Right", "Top", "Bottom"] as const).map((p) => (
        <Handle key={p} id={p[0]!.toLowerCase()} type="source" position={Position[p]} className={handle} />
      ))}
    </div>
  );
});

const BOUNDARY_STYLE: Record<string, string> = {
  region: "border-slate-400/70 border-dashed bg-slate-500/[0.03]",
  vpc: "border-emerald-500/70 bg-emerald-500/[0.03]",
  az: "border-sky-500/60 border-dashed bg-transparent",
  "subnet-public": "border-emerald-500/50 bg-emerald-500/[0.07]",
  "subnet-private": "border-sky-500/50 bg-sky-500/[0.07]",
};
const BOUNDARY_TAG: Record<string, string> = {
  region: "Region", vpc: "VPC / VNet", az: "Availability Zone", "subnet-public": "Public subnet", "subnet-private": "Private subnet",
};

export const BoundaryNode = memo(function BoundaryNode({ data }: NodeProps<Node<BoundaryNodeData>>) {
  return (
    <div className={cn("pointer-events-none rounded-2xl border-2", BOUNDARY_STYLE[data.boundary.kind])} style={{ width: data.rect.w, height: data.rect.h }}>
      <div className="px-3 pt-1 text-[11px] font-medium text-muted-foreground">
        <span className="mr-1.5 uppercase tracking-wider opacity-70">{BOUNDARY_TAG[data.boundary.kind]}</span>
        {data.boundary.label}
      </div>
    </div>
  );
});

export const RelationEdge = memo(function RelationEdge(props: EdgeProps<Edge<RelationEdgeData>>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, selected } = props;
  const [path, lx, ly] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 14 });
  const info = RELATION_INFO[data?.edge.relation ?? "connects"] ?? RELATION_INFO.connects!;
  const state = data?.state ?? "none";
  const lit = state !== "none" && state !== "dim";
  const color = lit ? OUTCOME_COLOR[state]! : data?.issue ? "#dc2626" : info.color;
  const label = [data?.edge.label, data?.edge.protocol && `${data.edge.protocol}${data.edge.port ? `:${data.edge.port}` : ""}`].filter(Boolean).join(" · ");
  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: color, strokeWidth: lit ? info.width + 1.5 : selected ? info.width + 1 : info.width,
          strokeDasharray: info.dash, opacity: state === "dim" ? 0.25 : 1, transition: "stroke 300ms, opacity 300ms",
        }}
      />
      {lit ? (
        <circle r={6} fill={color}>
          <animateMotion dur="1.4s" repeatCount="indefinite" path={path} />
        </circle>
      ) : null}
      {label && state !== "dim" ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded-md border bg-background/90 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, borderColor: lit ? color : undefined }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});

export const nodeTypes = { service: ServiceNode, boundary: BoundaryNode };
export const edgeTypes = { relation: RelationEdge };

export type Highlight = { nodeKeys: string[]; edgeKeys: string[]; outcome: Outcome } | null;

function handles(a: ArchNode, b: ArchNode) {
  const dx = (b.x ?? 0) - (a.x ?? 0);
  const dy = (b.y ?? 0) - (a.y ?? 0);
  if (Math.abs(dx) < NODE_W * 0.75) return dy >= 0 ? { s: "b", t: "t" } : { s: "t", t: "b" };
  return dx >= 0 ? { s: "r", t: "l" } : { s: "l", t: "r" };
}

export function toFlow(
  g: ArchGraph,
  opts: { highlight?: Highlight; selectedKey?: string | null; issues?: Map<string, "error" | "warning">; edgeIssues?: Set<string> } = {},
): { nodes: Node[]; edges: Edge[] } {
  const rects = boundaryRects(g);
  const hl = opts.highlight;
  const stateFor = (inSet: boolean): HighlightState => (!hl ? "none" : inSet ? hl.outcome : "dim");
  const depth = (b: Boundary) => {
    let d = 0;
    let cur: Boundary | undefined = b;
    while (cur?.parentId && d < 10) {
      cur = g.boundaries.find((x) => x.id === cur!.parentId);
      d++;
    }
    return d;
  };
  const boundaryNodes: Node[] = g.boundaries
    .filter((b) => rects.has(b.id))
    .sort((a, b) => depth(a) - depth(b))
    .map((b) => {
      const rect = rects.get(b.id)!;
      return {
        id: `boundary:${b.id}`, type: "boundary", position: { x: rect.x, y: rect.y }, data: { boundary: b, rect },
        draggable: false, selectable: false, connectable: false, focusable: false, zIndex: -1 - (10 - depth(b)),
        style: { pointerEvents: "none" as const },
      };
    });
  const serviceNodes: Node[] = g.nodes.map((n) => ({
    id: n.key, type: "service", position: { x: n.x ?? 0, y: n.y ?? 0 },
    data: { node: n, state: stateFor(Boolean(hl?.nodeKeys.includes(n.key))), issue: opts.issues?.get(n.key) },
    selected: opts.selectedKey === n.key, zIndex: 10,
  }));
  const byKey = new Map(g.nodes.map((n) => [n.key, n]));
  const edges: Edge[] = g.edges
    .filter((e) => byKey.has(e.source) && byKey.has(e.target))
    .map((e) => {
      const info = RELATION_INFO[e.relation] ?? RELATION_INFO.connects!;
      const h = handles(byKey.get(e.source)!, byKey.get(e.target)!);
      const state = stateFor(Boolean(hl?.edgeKeys.includes(e.key)));
      const color = state !== "none" && state !== "dim" ? OUTCOME_COLOR[state] : info.color;
      return {
        id: e.key, source: e.source, target: e.target, sourceHandle: h.s, targetHandle: h.t, type: "relation",
        data: { edge: e, state, issue: opts.edgeIssues?.has(e.key) }, selected: opts.selectedKey === `edge:${e.key}`, zIndex: 5,
        markerEnd: info.arrow ? { type: MarkerType.ArrowClosed, color, width: 16, height: 16 } : undefined,
      };
    });
  return { nodes: [...boundaryNodes, ...serviceNodes], edges };
}
