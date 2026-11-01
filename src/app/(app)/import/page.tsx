import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { listImports } from "@/server/imports";
import { topicOptions } from "@/server/topics";
import { relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ImportCenter } from "@/components/import/import-center";

export const metadata = { title: "Document Import Center" };

const STATUS = { UPLOADED: "outline", PARSED: "warning", SAVED: "success", FAILED: "warning" } as const;

export default async function ImportPage() {
  const user = await requireUser();
  const [topics, history] = await Promise.all([topicOptions(user.id), listImports(user.id)]);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Document Import Center</h1>
        <p className="text-sm text-muted-foreground">
          Turn ChatGPT answers and documents into editable journal pages. Content is sanitised, previewed, and saved only when you approve it.
          Complex Word layouts and scanned PDFs will not convert perfectly.
        </p>
      </div>
      <ImportCenter topics={topics} maxMb={env().MAX_UPLOAD_MB} />
      {history.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Import history</h2>
          <Card className="divide-y">
            {history.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                <Badge variant="outline">{h.sourceType}</Badge>
                <span className="truncate">{h.sourceName}</span>
                <Badge variant={STATUS[h.status]}>{h.status.toLowerCase()}</Badge>
                {h.status === "FAILED" && h.warnings[0] ? <span className="truncate text-xs text-destructive">{h.warnings[0]}</span> : null}
                {h.page ? <Link href={`/journal/${h.page.id}`} className="text-primary hover:underline">{h.page.title}</Link> : null}
                <span className="ml-auto text-xs text-muted-foreground">{relativeTime(h.createdAt)}</span>
              </div>
            ))}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
