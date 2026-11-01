import type { ArchGraph } from "./graph";

const id = (s: string) => s.replace(/[^A-Za-z0-9_]/g, "_");
const text = (s: string) => s.replace(/["`]/g, "'").replace(/[<>]/g, "");

const ARROW: Record<string, string> = {
  "dns-resolves": "-.->",
  "resolves-to": "-.->",
  "attached-to": "-.-",
  configures: "-.-",
  manages: "-.-",
  "health-checks": "-.->",
  replicates: "==>",
  failover: "-.->",
  uses: "-.->",
};

/** Mermaid flowchart of the graph: boundaries as nested subgraphs, relation styles as line styles. */
export function toMermaid(g: ArchGraph): string {
  const lines = ["flowchart LR"];
  const children = new Map<string | undefined, string[]>();
  for (const b of g.boundaries) children.set(b.parentId, [...(children.get(b.parentId) ?? []), b.id]);
  const nodesIn = (bid: string | undefined) => g.nodes.filter((n) => n.boundaryId === bid);
  const emit = (bid: string | undefined, indent: string) => {
    for (const n of nodesIn(bid)) lines.push(`${indent}${id(n.key)}["${text(n.label)}"]`);
    for (const c of children.get(bid) ?? []) {
      const b = g.boundaries.find((x) => x.id === c)!;
      lines.push(`${indent}subgraph ${id(`b_${b.id}`)}["${text(b.label)}"]`);
      emit(c, `${indent}  `);
      lines.push(`${indent}end`);
    }
  };
  emit(undefined, "  ");
  for (const e of g.edges) {
    const arrow = ARROW[e.relation] ?? "-->";
    const label = [e.label ?? (e.relation === "connects" ? "" : e.relation), e.protocol && `${e.protocol}${e.port ? `:${e.port}` : ""}`].filter(Boolean).join(" ");
    lines.push(`  ${id(e.source)} ${arrow}${label ? `|"${text(label)}"|` : ""} ${id(e.target)}`);
  }
  return lines.join("\n");
}
