"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useMemo } from "react";
import {
  Background, BackgroundVariant, ConnectionMode, Controls, MiniMap, ReactFlow,
  type Connection, type EdgeChange, type NodeChange,
} from "@xyflow/react";
import { useTheme } from "next-themes";
import { service } from "@/domain/architecture/catalog";
import type { ArchGraph, Relation, ValidationResult } from "@/domain/architecture/graph";
import { defaultRelation } from "@/domain/architecture/relations";
import { edgeTypes, nodeTypes, toFlow, type Highlight } from "./flow-elements";

export type Selection = { type: "node"; key: string } | { type: "edge"; key: string } | null;

type Props = {
  graph: ArchGraph;
  editable?: boolean;
  highlight?: Highlight;
  validation?: ValidationResult[];
  selection?: Selection;
  onSelect?: (s: Selection) => void;
  /** commit=false while dragging (no undo entry), true when a change is complete */
  onChange?: (g: ArchGraph, commit: boolean) => void;
  height?: number | string;
  showMiniMap?: boolean;
  className?: string;
};

let edgeSeq = 0;
export function newEdgeKey(g: ArchGraph) {
  let k: string;
  do k = `c${Date.now().toString(36)}${(edgeSeq++).toString(36)}`;
  while (g.edges.some((e) => e.key === k));
  return k;
}

export function DiagramCanvas({ graph, editable = false, highlight, validation, selection, onSelect, onChange, height = 560, showMiniMap, className }: Props) {
  const { resolvedTheme } = useTheme();
  const { issues, edgeIssues } = useMemo(() => {
    const issues = new Map<string, "error" | "warning">();
    const edgeIssues = new Set<string>();
    for (const v of validation ?? []) {
      if (v.level === "assumption") continue;
      for (const k of v.nodeKeys ?? []) if (issues.get(k) !== "error") issues.set(k, v.level);
      if (v.level === "error") for (const k of v.edgeKeys ?? []) edgeIssues.add(k);
    }
    return { issues, edgeIssues };
  }, [validation]);
  const selectedKey = selection ? (selection.type === "edge" ? `edge:${selection.key}` : selection.key) : null;
  const flow = useMemo(() => toFlow(graph, { highlight, selectedKey, issues, edgeIssues }), [graph, highlight, selectedKey, issues, edgeIssues]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!editable || !onChange) return;
      let next = graph;
      let commit = false;
      let changed = false;
      for (const c of changes) {
        if (c.type === "position" && c.position && !c.id.startsWith("boundary:")) {
          next = { ...next, nodes: next.nodes.map((n) => (n.key === c.id ? { ...n, x: Math.round(c.position!.x), y: Math.round(c.position!.y) } : n)) };
          changed = true;
          if (c.dragging === false) commit = true;
        } else if (c.type === "position" && c.dragging === false) {
          commit = true;
          changed = true;
        } else if (c.type === "remove" && !c.id.startsWith("boundary:")) {
          next = { ...next, nodes: next.nodes.filter((n) => n.key !== c.id), edges: next.edges.filter((e) => e.source !== c.id && e.target !== c.id) };
          commit = true;
          changed = true;
        }
      }
      if (changed) onChange(next, commit);
    },
    [editable, graph, onChange],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (!editable || !onChange) return;
      const removed = new Set(changes.filter((c) => c.type === "remove").map((c) => c.id));
      if (removed.size) onChange({ ...graph, edges: graph.edges.filter((e) => !removed.has(e.key)) }, true);
    },
    [editable, graph, onChange],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!editable || !onChange || !c.source || !c.target || c.source === c.target) return;
      const s = graph.nodes.find((n) => n.key === c.source);
      const t = graph.nodes.find((n) => n.key === c.target);
      if (!s || !t) return;
      const relation: Relation = defaultRelation(s.kind, t.kind);
      const key = newEdgeKey(graph);
      onChange({ ...graph, edges: [...graph.edges, { key, source: s.key, target: t.key, relation }] }, true);
      onSelect?.({ type: "edge", key });
    },
    [editable, graph, onChange, onSelect],
  );

  return (
    <div className={className} style={{ height }}>
      <ReactFlow
        nodes={flow.nodes}
        edges={flow.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={editable}
        nodesConnectable={editable}
        elementsSelectable
        deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
        onNodeClick={(_, n) => onSelect?.(n.id.startsWith("boundary:") ? null : { type: "node", key: n.id })}
        onEdgeClick={(_, e) => onSelect?.({ type: "edge", key: e.id })}
        onPaneClick={() => onSelect?.(null)}
        colorMode={resolvedTheme === "light" ? "light" : "dark"}
        fitView
        fitViewOptions={{ padding: 0.06, minZoom: 0.4, maxZoom: 1.1 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
        {showMiniMap ? (
          <MiniMap pannable zoomable nodeColor={(n) => (n.type === "service" ? service((n.data as { node: { kind: string } }).node.kind).color : "transparent")} />
        ) : null}
      </ReactFlow>
    </div>
  );
}
