import Link from "next/link";
import type { Concept } from "@/domain/architecture/library";
import { conceptGraph } from "@/domain/architecture/library";
import { service } from "@/domain/architecture/catalog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function ConceptCard({ concept }: { concept: Concept }) {
  const g = conceptGraph(concept.id)!.graph;
  const kinds = [...new Set(g.nodes.map((n) => n.kind).filter((k) => k !== "client"))].slice(0, 7);
  return (
    <Link href={`/studio/concepts/${concept.id}`}>
      <Card className="flex h-full flex-col gap-2 p-4 transition-colors hover:border-primary/50">
        <div className="flex items-center gap-2">
          <Badge variant={concept.provider === "aws" ? "aws" : "azure"}>{concept.provider.toUpperCase()}</Badge>
          <h3 className="font-medium leading-tight">{concept.title}</h3>
        </div>
        <p className="line-clamp-3 text-sm text-muted-foreground">{concept.summary}</p>
        <div className="mt-auto flex flex-wrap gap-1 pt-1">
          {kinds.map((k) => (
            <span key={k} className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: service(k).color }} title={service(k).label}>
              {service(k).short}
            </span>
          ))}
        </div>
      </Card>
    </Link>
  );
}
