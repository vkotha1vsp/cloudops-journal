import Link from "next/link";
import { ArrowRight, BookOpen, CalendarClock, FileUp, FlaskConical, Network, NotebookPen, Siren } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { dashboardData, type TrackProgress } from "@/server/dashboard";
import { recentViews } from "@/server/bookmarks";
import { preview } from "@/domain/tiptap";
import { slugFromTrack } from "@/domain/tracks";
import { relativeTime, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NewPageButton } from "@/components/journal/new-page-button";

export const metadata = { title: "Dashboard" };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function Dashboard() {
  const user = await requireUser();
  const [d, recent] = await Promise.all([dashboardData(user.id), recentViews(user.id, 6)]);
  const now = Date.now();

  const stats = [
    { label: "Journal pages", value: d.pageCount, icon: NotebookPen, href: "/journal" },
    { label: "Learning topics", value: d.topicCount, icon: BookOpen, href: "/learn/aws" },
    { label: "Due for review", value: d.reviewDue, icon: CalendarClock, href: "#review", warn: d.reviewDue > 0 },
    { label: "Active labs", value: d.activeLabs, icon: FlaskConical, href: "/labs" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {user.name ?? user.email.split("@")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">Pick up where you left off.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <NewPageButton />
          <Button variant="outline" asChild><Link href="/studio"><Network /> Generate architecture</Link></Button>
          <Button variant="outline" asChild><Link href="/import"><FileUp /> Import from ChatGPT</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="flex items-center gap-3 p-4 transition-colors hover:border-primary/50">
              <span className={cn("grid size-10 place-items-center rounded-lg bg-muted", s.warn ? "text-amber-500" : "text-primary")}>
                <s.icon className="size-5" />
              </span>
              <div>
                <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recently edited</CardTitle>
            <Link href="/journal" className="text-xs text-muted-foreground hover:text-foreground">All pages →</Link>
          </CardHeader>
          <CardContent>
            {d.recentPages.length ? (
              <ul className="divide-y">
                {d.recentPages.map((p) => (
                  <li key={p.id}>
                    <Link href={`/journal/${p.id}`} className="flex items-start gap-3 py-2.5 hover:text-primary">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{p.title}</div>
                        <div className="truncate text-xs text-muted-foreground">{preview(p.plainText, 120) || "Empty page"}</div>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(p.updatedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="No pages yet. Start your first journal entry." action={<NewPageButton size="sm" variant="outline" />} />
            )}
          </CardContent>
        </Card>

        <Card id="review">
          <CardHeader>
            <CardTitle>Topics needing review</CardTitle>
          </CardHeader>
          <CardContent>
            {d.dueTopics.length ? (
              <ul className="space-y-2">
                {d.dueTopics.map((r) => {
                  const due = r.nextReviewAt ? r.nextReviewAt.getTime() <= now : false;
                  return (
                    <li key={r.topic.id}>
                      <Link href={`/learn/${slugFromTrack(r.topic.category.track)}/topic/${r.topic.id}`} className="flex items-center justify-between gap-2 text-sm hover:text-primary">
                        <span className="truncate">{r.topic.title}</span>
                        <Badge variant={due ? "warning" : "outline"}>{r.nextReviewAt ? (due ? "due" : relativeTime(r.nextReviewAt)) : "—"}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty text="Set a status and confidence on a topic to schedule reviews." />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ProgressCard title="AWS learning topics" track="aws" rows={d.aws} accent="bg-aws" />
        <ProgressCard title="Azure learning topics" track="azure" rows={d.azure} accent="bg-azure" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader><CardTitle>Recent architectures</CardTitle></CardHeader>
          <CardContent>
            {d.diagrams.length ? (
              <ul className="space-y-1.5 text-sm">{d.diagrams.map((x) => <li key={x.id} className="flex items-center justify-between gap-2"><Link href={`/studio/${x.id}`} className="truncate hover:text-primary">{x.title}</Link><Badge variant={x.provider === "azure" ? "azure" : "aws"}>{x.provider.toUpperCase()}</Badge></li>)}</ul>
            ) : (
              <Empty text="No saved architectures yet." action={<Link href="/studio" className="text-xs text-primary">Open the concept library →</Link>} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Active hands-on labs</CardTitle></CardHeader>
          <CardContent>
            {d.labs.length ? (
              <ul className="space-y-1.5 text-sm">{d.labs.map((x) => <li key={x.id} className="flex justify-between gap-2"><Link href={`/labs/${x.id}`} className="truncate hover:text-primary">{x.title}</Link><Badge variant="outline">{x.status.toLowerCase().replace("_", " ")}</Badge></li>)}</ul>
            ) : (
              <Empty text="No lab in progress." action={<Link href="/labs" className="text-xs text-primary">Start from a template →</Link>} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-1.5"><Siren className="size-4" /> Saved troubleshooting</CardTitle></CardHeader>
          <CardContent>
            {d.savedCases.length ? (
              <ul className="space-y-1.5 text-sm">{d.savedCases.map((b) => <li key={b.id}><Link className="hover:text-primary" href={b.href}>{b.label}</Link></li>)}</ul>
            ) : (
              <Empty text="Bookmark troubleshooting cases to keep them here." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recently viewed</CardTitle></CardHeader>
          <CardContent>
            {recent.length ? (
              <ul className="space-y-1.5 text-sm">
                {recent.map((r) => (
                  <li key={r.id}><Link href={r.href} className="flex items-center justify-between gap-2 hover:text-primary"><span className="truncate">{r.label}</span><span className="text-[10px] uppercase text-muted-foreground">{r.entityType.toLowerCase()}</span></Link></li>
                ))}
              </ul>
            ) : (
              <Empty text="Pages and topics you open appear here." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProgressCard({ title, track, rows, accent }: { title: string; track: string; rows: TrackProgress[]; accent: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <Link href={`/learn/${track}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Open <ArrowRight className="size-3" /></Link>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {rows.slice(0, 8).map((r) => {
          const pct = r.total ? Math.round((r.started / r.total) * 100) : 0;
          return (
            <Link key={r.categoryId} href={`/learn/${track}`} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
              <span className="truncate">{r.name}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span className={cn("block h-full rounded-full", accent)} style={{ width: `${pct}%` }} />
              </span>
              <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">{r.started}/{r.total}</span>
            </Link>
          );
        })}
        {rows.length > 8 ? <p className="text-xs text-muted-foreground">+{rows.length - 8} more categories</p> : null}
      </CardContent>
    </Card>
  );
}

function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 py-2 text-sm text-muted-foreground">
      <p>{text}</p>
      {action}
    </div>
  );
}
