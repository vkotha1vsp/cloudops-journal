import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { conceptGraph } from "@/domain/architecture/library";
import { Badge } from "@/components/ui/badge";
import { FlowPlayer } from "@/components/architecture/flow-player";
import { OpenCopyButton } from "@/components/architecture/open-copy-button";

export default async function ConceptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const c = conceptGraph(id);
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="text-sm"><Link href="/studio" className="text-muted-foreground hover:text-foreground">← Architecture Studio</Link></div>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant={c.concept.provider === "aws" ? "aws" : "azure"}>{c.concept.provider.toUpperCase()}</Badge>
            <h1 className="text-2xl font-semibold tracking-tight">{c.concept.title}</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{c.concept.summary}</p>
        </div>
        <OpenCopyButton conceptId={c.concept.id} />
      </div>
      <FlowPlayer graph={c.graph} height={600} />
      {c.assumptions.length ? (
        <div className="rounded-xl border bg-card p-4 text-sm">
          <h2 className="mb-1 font-semibold">Assumptions</h2>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">{c.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}
