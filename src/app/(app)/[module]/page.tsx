import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { UPCOMING } from "@/domain/nav";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Modules scheduled for later phases. Deliberately not a mockup: this page states what is
 * coming and when, so nothing pretends to work before it does.
 */
export default async function UpcomingModule({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const info = UPCOMING[module];
  if (!info) notFound();
  return (
    <div className="mx-auto max-w-2xl py-10">
      <Card className="p-8">
        <Badge variant="outline">Phase {info.phase}</Badge>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{info.title}</h1>
        <p className="mt-2 text-muted-foreground">{info.summary}</p>
        <ul className="mt-6 space-y-2 text-sm">
          {info.delivers.map((d) => (
            <li key={d} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{d}</li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted-foreground">
          Until then, capture notes in the <Link href="/journal" className="text-primary underline">journal</Link>. Everything you write is indexed by search and can be linked to this module later.
        </p>
      </Card>
    </div>
  );
}
