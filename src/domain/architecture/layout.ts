/**
 * Deterministic layout: columns by service tier (user → DNS/edge → entry → config → compute → data),
 * rows by Availability Zone. Boundaries are never positioned by hand: their rectangles are the bounding
 * box of their members, so moving a resource stretches its subnet, AZ and VPC around it.
 */
import { SECURITY_FILTER_KINDS, service } from "./catalog";
import type { ArchGraph, ArchNode, Boundary } from "./graph";

export const NODE_W = 184;
export const NODE_H = 62;
const COL = 248;
const ROW = 88;
const LANE_GAP = 104;
const PAD = 18;
const LABEL = 28;

type Lane = "az0" | "mid" | "az1" | "az2" | "region";

function boundaryChain(n: ArchNode, byId: Map<string, Boundary>): Boundary[] {
  const out: Boundary[] = [];
  let b = n.boundaryId ? byId.get(n.boundaryId) : undefined;
  for (let i = 0; b && i < 12; i++) {
    out.push(b);
    b = b.parentId ? byId.get(b.parentId) : undefined;
  }
  return out;
}

export function autoLayout(g: ArchGraph): ArchGraph {
  const byId = new Map(g.boundaries.map((b) => [b.id, b]));
  const azIds = g.boundaries.filter((b) => b.kind === "az").map((b) => b.id);
  const nodeByKey = new Map(g.nodes.map((n) => [n.key, n]));

  const rawTier = (n: ArchNode): number => {
    const def = service(n.kind);
    // Config attached to something sits in that thing's column.
    if (SECURITY_FILTER_KINDS.has(n.kind) || n.kind === "acm" || n.kind === "waf") {
      const targets = g.edges
        .filter((e) => e.source === n.key && (e.relation === "attached-to" || e.relation === "configures"))
        .map((e) => nodeByKey.get(e.target))
        .filter((x): x is ArchNode => Boolean(x));
      if (targets.length) return Math.min(...targets.map((t) => service(t.kind).tier));
    }
    return def.tier;
  };
  const laneOf = (n: ArchNode): Lane => {
    const chain = boundaryChain(n, byId);
    const az = chain.find((b) => b.kind === "az");
    if (az) return (["az0", "az1", "az2"][azIds.indexOf(az.id)] ?? "az0") as Lane;
    if (chain.some((b) => b.kind === "vpc" || b.kind.startsWith("subnet"))) {
      // Azure-style subnets without AZs share the first row.
      if (azIds.length === 0 && chain.some((b) => b.kind.startsWith("subnet"))) return "az0";
      return "mid";
    }
    if (chain.some((b) => b.kind === "region")) return "region";
    return "mid";
  };

  // Only columns that hold something, packed left to right.
  const usedTiers = [...new Set(g.nodes.map((n) => rawTier(n)))].sort((a, b) => a - b);
  const tierOf = (n: ArchNode) => usedTiers.indexOf(rawTier(n));

  const cells = new Map<string, ArchNode[]>();
  for (const n of g.nodes) {
    const key = `${laneOf(n)}|${tierOf(n)}`;
    cells.set(key, [...(cells.get(key) ?? []), n]);
  }
  const laneOrder: Lane[] = ["az0", "mid", "az1", "az2", "region"];
  const laneRows = (lane: Lane) => Math.max(0, ...[...cells.entries()].filter(([k]) => k.startsWith(`${lane}|`)).map(([, v]) => v.length));
  const laneTop = new Map<Lane, number>();
  let y = 0;
  for (const lane of laneOrder) {
    const rows = laneRows(lane);
    laneTop.set(lane, y);
    if (rows > 0) y += rows * ROW + LANE_GAP;
  }
  // Nodes outside every boundary (users, global DNS/CDN) are centred vertically on the VPC rows.
  const placed = g.nodes.map((n) => {
    const lane = laneOf(n);
    const tier = tierOf(n);
    const cell = cells.get(`${lane}|${tier}`) ?? [];
    const idx = cell.indexOf(n);
    return { ...n, x: 40 + tier * COL, y: (laneTop.get(lane) ?? 0) + idx * ROW };
  });
  const hasAzRows = laneRows("az0") + laneRows("az1") > 0;
  if (hasAzRows) {
    const top = laneTop.get("az0") ?? 0;
    const bottom = (laneTop.get(laneRows("az1") ? "az1" : "mid") ?? 0) + Math.max(1, laneRows(laneRows("az1") ? "az1" : "mid")) * ROW;
    const centre = Math.round((top + bottom) / 2 - NODE_H / 2);
    for (const n of placed) {
      if (!n.boundaryId) {
        const sameCell = placed.filter((m) => !m.boundaryId && m.x === n.x);
        const i = sameCell.indexOf(n);
        n.y = centre + (i - (sameCell.length - 1) / 2) * ROW;
      }
    }
  }
  return { ...g, nodes: placed };
}

export type Rect = { x: number; y: number; w: number; h: number };

/** Rectangles for every boundary that holds something, innermost first. */
export function boundaryRects(g: ArchGraph): Map<string, Rect> {
  const rects = new Map<string, Rect>();
  const depth = (b: Boundary): number => {
    let d = 0;
    let cur: Boundary | undefined = b;
    const byId = new Map(g.boundaries.map((x) => [x.id, x]));
    while (cur?.parentId && d < 12) {
      cur = byId.get(cur.parentId);
      d++;
    }
    return d;
  };
  const ordered = [...g.boundaries].sort((a, b) => depth(b) - depth(a));
  for (const b of ordered) {
    const boxes: Rect[] = [];
    for (const n of g.nodes) if (n.boundaryId === b.id) boxes.push({ x: n.x ?? 0, y: n.y ?? 0, w: NODE_W, h: NODE_H });
    for (const c of g.boundaries) if (c.parentId === b.id && rects.has(c.id)) boxes.push(rects.get(c.id)!);
    if (!boxes.length) continue;
    const x1 = Math.min(...boxes.map((r) => r.x)) - PAD;
    const y1 = Math.min(...boxes.map((r) => r.y)) - PAD - LABEL;
    const x2 = Math.max(...boxes.map((r) => r.x + r.w)) + PAD;
    const y2 = Math.max(...boxes.map((r) => r.y + r.h)) + PAD;
    rects.set(b.id, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
  }
  return rects;
}
