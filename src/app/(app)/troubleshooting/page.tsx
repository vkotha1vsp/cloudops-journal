import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { CASE_AREAS, listCases } from "@/server/cases";
import { relativeTime, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AREA_LABEL } from "@/components/troubleshooting/case-editor";

export const metadata = { title: "Troubleshooting KB" };

export default async function TroubleshootingPage({ searchParams }: { searchParams: Promise<{ area?: string; q?: string }> }) {
  const user = await requireUser();
  const { area, q } = await searchParams;
  const cases = await listCases(user.id, { area, q });
  const qs = (a?: string) => {
    const p = new URLSearchParams();
    if (a) p.set("area", a);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/troubleshooting?${s}` : "/troubleshooting";
  };
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Troubleshooting Knowledge Base</h1>
          <p className="text-sm text-muted-foreground">Error → investigation → root cause → fix, linked to the labs and architectures where it happened.</p>
        </div>
        <Button asChild><Link href="/troubleshooting/new"><Plus /> New case</Link></Button>
      </div>
      <form className="flex gap-2" action="/troubleshooting">
        {area ? <input type="hidden" name="area" value={area} /> : null}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <input name="q" defaultValue={q} placeholder="Search error messages, commands, services…" className="h-9 w-full rounded-md border bg-transparent pl-8 pr-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" />
        </div>
        <Button type="submit" variant="outline">Search</Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        <Link href={qs()} className={cn("rounded-md border px-2.5 py-1 text-xs", !area ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>All</Link>
        {CASE_AREAS.map((a) => (
          <Link key={a} href={qs(a)} className={cn("rounded-md border px-2.5 py-1 text-xs", area === a ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>{AREA_LABEL[a]}</Link>
        ))}
      </div>
      {cases.length ? (
        <div className="space-y-2">
          {cases.map((c) => (
            <Link key={c.id} href={`/troubleshooting/${c.id}`} className="block">
              <Card className="space-y-1.5 p-4 transition-colors hover:border-primary/50">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={c.area === "aws" ? "aws" : c.area === "azure" ? "azure" : "devops"}>{AREA_LABEL[c.area] ?? c.area}</Badge>
                  <h3 className="font-medium">{c.title}</h3>
                  <span className="ml-auto text-xs text-muted-foreground">{relativeTime(c.updatedAt)}</span>
                </div>
                {c.errorMessage ? <p className="line-clamp-2 font-mono text-xs text-muted-foreground">{c.errorMessage}</p> : null}
                <p className="text-xs text-muted-foreground">
                  {c.services.join(", ")}{c.services.length ? " · " : ""}{c._count.labs} labs · {c._count.diagrams} architectures
                </p>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="p-5 text-sm text-muted-foreground">{q || area ? "No cases match. Global search (⌘K) also looks inside labs and pages." : "No cases yet. Record the next error you fix; future you will search for it."}</Card>
      )}
    </div>
  );
}
