import Link from "next/link";
import { CheckCircle2, Circle, CircleDot, FlaskConical, Network } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROADMAPS, type RoadmapItem } from "@/domain/roadmaps";
import { LAB_TEMPLATES } from "@/domain/labs/templates";
import { CONCEPTS } from "@/domain/architecture/library";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Learning Roadmaps" };

const TRACK_SLUG = { AWS: "aws", AZURE: "azure", DEVOPS: "devops" } as const;
const STATUS_TEXT = { NOT_STARTED: "Not started", LEARNING: "Learning", REVIEWING: "Reviewing", MASTERED: "Mastered" } as const;

export default async function RoadmapsPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const user = await requireUser();
  const { r } = await searchParams;
  const active = ROADMAPS.find((x) => x.id === r) ?? ROADMAPS[0]!;
  const topics = await db().topic.findMany({
    where: { ownerId: user.id },
    select: { id: true, title: true, category: { select: { track: true } }, progress: { where: { ownerId: user.id }, select: { status: true } } },
  });
  const byKey = new Map(topics.map((t) => [`${t.category.track}:${t.title.toLowerCase()}`, t]));
  const statusOf = (track: string, title: string) => byKey.get(`${track}:${title.toLowerCase()}`)?.progress[0]?.status ?? "NOT_STARTED";
  const score = (st: string) => (st === "MASTERED" ? 1 : st === "REVIEWING" ? 0.75 : st === "LEARNING" ? 0.4 : 0);
  const pct = (list: RoadmapItem[]) => Math.round((list.reduce((a, i) => a + score(statusOf(i.track, i.topic)), 0) / Math.max(list.length, 1)) * 100);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Learning Roadmaps</h1>
        <p className="text-sm text-muted-foreground">Ordered paths through your own topics. Progress comes from the status you set on each topic page.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {ROADMAPS.map((x) => {
          const p = pct(x.stages.flatMap((s) => s.items));
          return (
            <Link key={x.id} href={`/roadmaps?r=${x.id}`}>
              <Card className={cn("h-full space-y-2 p-4 transition-colors hover:border-primary/50", x.id === active.id && "border-primary")}>
                <h2 className="font-medium">{x.title}</h2>
                <p className="text-xs text-muted-foreground">{x.description}</p>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${p}%` }} /></div>
                <p className="text-xs text-muted-foreground">{p}% complete</p>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="space-y-5">
        {active.stages.map((stage) => (
          <section key={stage.title} className="space-y-2">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold">{stage.title}</h2>
              <span className="text-xs text-muted-foreground">{pct(stage.items)}%</span>
            </div>
            <ol className="space-y-1.5 border-l pl-4">
              {stage.items.map((item) => {
                const topic = byKey.get(`${item.track}:${item.topic.toLowerCase()}`);
                const st = statusOf(item.track, item.topic);
                const lab = item.lab ? LAB_TEMPLATES.find((l) => l.id === item.lab) : undefined;
                const concept = item.concept ? CONCEPTS.find((c) => c.id === item.concept) : undefined;
                const StatusIcon = st === "MASTERED" ? CheckCircle2 : st === "NOT_STARTED" ? Circle : CircleDot;
                return (
                  <li key={item.topic} className="relative">
                    <Card className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                      <StatusIcon className={cn("size-4 shrink-0", st === "MASTERED" ? "text-emerald-500" : st === "NOT_STARTED" ? "text-muted-foreground" : "text-primary")} />
                      {topic ? (
                        <Link href={`/learn/${TRACK_SLUG[item.track]}/topic/${topic.id}`} className="font-medium hover:underline">{item.topic}</Link>
                      ) : (
                        <span className="font-medium text-muted-foreground" title="Not in your knowledge tree; add it from the track page">{item.topic}</span>
                      )}
                      <span className="text-xs text-muted-foreground">{STATUS_TEXT[st]}</span>
                      <span className="w-full text-sm text-muted-foreground sm:w-auto sm:flex-1">{item.why}</span>
                      <span className="flex gap-2 text-xs">
                        {concept ? <Link href={`/studio/concepts/${concept.id}`} className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><Network className="size-3.5" /> Diagram</Link> : null}
                        {lab ? <Link href={`/labs${topic ? `?topic=${topic.id}` : ""}`} className="flex items-center gap-1 text-muted-foreground hover:text-foreground" title={lab.title}><FlaskConical className="size-3.5" /> Lab</Link> : null}
                      </span>
                    </Card>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
