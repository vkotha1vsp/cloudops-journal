import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listLabs } from "@/server/labs";
import { LAB_TEMPLATES } from "@/domain/labs/templates";
import { db } from "@/lib/db";
import { relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StartLabButton } from "@/components/labs/start-lab-button";

export const metadata = { title: "Hands-On Labs" };

const STATUS_VARIANT = { PLANNED: "outline", IN_PROGRESS: "default", BLOCKED: "warning", COMPLETED: "success" } as const;
const STATUS_TEXT = { PLANNED: "Planned", IN_PROGRESS: "In progress", BLOCKED: "Blocked", COMPLETED: "Completed" } as const;

export default async function LabsPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const user = await requireUser();
  const { topic: topicId } = await searchParams;
  const topic = topicId ? await db().topic.findFirst({ where: { id: topicId, ownerId: user.id }, select: { id: true, title: true } }) : null;
  const labs = await listLabs(user.id, { topicId: topic?.id });
  const needle = topic?.title.toLowerCase();
  const templates = needle
    ? [...LAB_TEMPLATES].sort((a, b) => Number(b.topics.some((t) => needle.includes(t.toLowerCase()))) - Number(a.topics.some((t) => needle.includes(t.toLowerCase()))))
    : LAB_TEMPLATES;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hands-On Labs{topic ? ` · ${topic.title}` : ""}</h1>
          <p className="text-sm text-muted-foreground">Plan a lab, then record what actually happened: output, errors, root cause, fix and cleanup.</p>
        </div>
        <div className="flex gap-2">
          {topic ? <Link href="/labs" className="text-sm text-muted-foreground underline">Show all labs</Link> : null}
          <StartLabButton topicId={topic?.id} label="Blank lab" variant="outline" />
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">My labs</h2>
        {labs.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {labs.map((l) => {
              const done = l.steps.filter((s) => s.done).length;
              const pct = l.steps.length ? Math.round((done / l.steps.length) * 100) : 0;
              return (
                <Link key={l.id} href={`/labs/${l.id}`}>
                  <Card className="flex h-full flex-col gap-2 p-4 transition-colors hover:border-primary/50">
                    <div className="flex items-center gap-2">
                      <FlaskConical className="size-4 shrink-0 text-muted-foreground" />
                      <h3 className="truncate font-medium">{l.title}</h3>
                      <Badge className="ml-auto shrink-0" variant={STATUS_VARIANT[l.status]}>{STATUS_TEXT[l.status]}</Badge>
                    </div>
                    {l.objective ? <p className="line-clamp-2 text-sm text-muted-foreground">{l.objective}</p> : null}
                    <div className="mt-auto space-y-1">
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                      <p className="text-xs text-muted-foreground">{done}/{l.steps.length} steps · {relativeTime(l.updatedAt)}{l.topic ? ` · ${l.topic.title}` : ""}</p>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card className="p-5 text-sm text-muted-foreground">No labs yet. Start from a template below; it becomes your own editable copy.</Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Starter templates</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t, i) => (
            <Card key={t.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-center gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">{LAB_TEMPLATES.indexOf(t) + 1}</span>
                <h3 className="font-medium">{t.title}</h3>
              </div>
              <p className="line-clamp-3 text-sm text-muted-foreground">{t.objective}</p>
              <div className="flex flex-wrap gap-1">
                {t.topics.map((x) => <Badge key={x} variant={t.track === "aws" ? "aws" : "devops"}>{x}</Badge>)}
              </div>
              <p className="text-xs text-muted-foreground">{t.steps.length} steps · {t.estimatedCost}</p>
              <div className="mt-auto pt-1"><StartLabButton templateId={t.id} topicId={topic?.id} label={i === 0 && topic ? "Start (best match)" : "Start lab"} /></div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
