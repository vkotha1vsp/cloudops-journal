import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listDiagrams } from "@/server/diagrams";
import { CONCEPTS } from "@/domain/architecture/library";
import { relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConceptCard } from "@/components/architecture/concept-card";

export const metadata = { title: "Architecture Studio" };

export default async function StudioHome() {
  const user = await requireUser();
  const diagrams = await listDiagrams(user.id);
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Architecture Studio</h1>
          <p className="text-sm text-muted-foreground">Generate, validate, edit and animate AWS and Azure architectures.</p>
        </div>
        <Button asChild><Link href="/studio/new"><Plus /> New architecture</Link></Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">My diagrams</h2>
        {diagrams.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {diagrams.map((d) => (
              <Link key={d.id} href={`/studio/${d.id}`}>
                <Card className="flex h-full flex-col gap-1.5 p-4 transition-colors hover:border-primary/50">
                  <div className="flex items-center gap-2">
                    <Badge variant={d.provider === "azure" ? "azure" : "aws"}>{d.provider.toUpperCase()}</Badge>
                    <h3 className="truncate font-medium">{d.title}</h3>
                  </div>
                  {d.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{d.description}</p> : null}
                  <p className="mt-auto text-xs text-muted-foreground">
                    {d._count.nodes} resources · v{d.currentVersion} · {relativeTime(d.updatedAt)}{d.topic ? ` · ${d.topic.title}` : ""}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-muted-foreground">
            <span>No saved diagrams yet. Start one, or open a copy of a concept below.</span>
            <Button variant="outline" size="sm" asChild><Link href="/studio/new"><Sparkles /> Generate one</Link></Button>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Concept library</h2>
          <p className="text-sm text-muted-foreground">Interactive reference architectures with animated request flows and failure simulations.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {CONCEPTS.map((c) => <ConceptCard key={c.id} concept={c} />)}
        </div>
      </section>
    </div>
  );
}
