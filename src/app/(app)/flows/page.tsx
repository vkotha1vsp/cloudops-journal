import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDiagram, listDiagrams } from "@/server/diagrams";
import { CONCEPTS, conceptGraph } from "@/domain/architecture/library";
import { FLOW_MODES, type FlowMode } from "@/domain/architecture/scenarios";
import { cn } from "@/lib/utils";
import { FlowPlayer } from "@/components/architecture/flow-player";

export const metadata = { title: "Animated Process Flows" };

export default async function FlowsPage({ searchParams }: { searchParams: Promise<{ concept?: string; diagram?: string; mode?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const diagrams = await listDiagrams(user.id);
  let title = "";
  let graph = null;
  if (sp.diagram) {
    const d = await getDiagram(user.id, sp.diagram).catch(() => null);
    if (d) {
      title = d.title;
      graph = d.graph;
    }
  } else {
    const c = conceptGraph(sp.concept ?? "alb-web-app");
    if (c) {
      title = c.concept.title;
      graph = c.graph;
    }
  }
  const mode = FLOW_MODES.some((m) => m.mode === sp.mode) ? (sp.mode as FlowMode) : "normal";
  const current = sp.diagram ? `d:${sp.diagram}` : `c:${sp.concept ?? "alb-web-app"}`;
  const item = (key: string, href: string, label: string) => (
    <Link key={key} href={href} className={cn("block truncate rounded-md px-2 py-1.5 text-sm hover:bg-muted", current === key && "bg-accent font-medium text-accent-foreground")}>{label}</Link>
  );
  return (
    <div className="mx-auto grid max-w-[1500px] gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-4">
        <div>
          <h2 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Concepts</h2>
          {CONCEPTS.map((c) => item(`c:${c.id}`, `/flows?concept=${c.id}`, c.title))}
        </div>
        <div>
          <h2 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">My diagrams</h2>
          {diagrams.length ? diagrams.map((d) => item(`d:${d.id}`, `/flows?diagram=${d.id}`, d.title)) : <p className="px-2 text-sm text-muted-foreground">None saved yet.</p>}
        </div>
      </aside>
      <section className="min-w-0 space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title || "Animated Process Flows"}</h1>
        {graph ? <FlowPlayer key={current} graph={graph} initialMode={mode} height={600} /> : <p className="text-sm text-muted-foreground">Choose a concept or diagram.</p>}
      </section>
    </div>
  );
}
