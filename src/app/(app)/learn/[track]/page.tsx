import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { trackFromSlug } from "@/domain/tracks";
import { getTree, type TreeCategory } from "@/server/categories";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/layout/icon";
import { cn } from "@/lib/utils";

const allTopics = (c: TreeCategory): TreeCategory["topics"] => [...c.topics, ...c.children.flatMap(allTopics)];

export default async function TrackOverview({ params }: { params: Promise<{ track: string }> }) {
  const { track: slug } = await params;
  const track = trackFromSlug(slug);
  if (!track) notFound();
  const user = await requireUser();
  const tree = await getTree(user.id, track.key);
  const topics = tree.flatMap(allTopics);
  const started = topics.filter((t) => t.status !== "NOT_STARTED").length;
  const mastered = topics.filter((t) => t.status === "MASTERED").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className={cn("text-2xl font-semibold tracking-tight")}>{track.label}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {topics.length} topics · {started} started · {mastered} mastered. Add categories and topics from the tree; nothing here is hard-coded.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tree.map((c) => {
          const ts = allTopics(c);
          const pct = ts.length ? Math.round((ts.filter((t) => t.status !== "NOT_STARTED").length / ts.length) * 100) : 0;
          return (
            <Card key={c.id} className="p-4">
              <div className="flex items-center gap-2">
                <span className={cn("grid size-8 place-items-center rounded-lg bg-muted", track.color)}>
                  <Icon name={c.icon} className="size-4" />
                </span>
                <h2 className="font-medium">{c.name}</h2>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">{pct}%</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {ts.slice(0, 8).map((t) => (
                  <li key={t.id}>
                    <Link href={`/learn/${slug}/topic/${t.id}`} className="inline-block rounded-md border px-2 py-0.5 text-xs text-muted-foreground hover:border-primary/60 hover:text-foreground">
                      {t.title}
                    </Link>
                  </li>
                ))}
                {ts.length > 8 ? <li className="px-1 text-xs text-muted-foreground">+{ts.length - 8} more</li> : null}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
