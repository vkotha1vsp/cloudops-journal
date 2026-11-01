import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listTags } from "@/server/pages";
import { preview } from "@/domain/tiptap";
import { relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { NewPageButton } from "@/components/journal/new-page-button";
import { PageTree } from "@/components/journal/page-tree";

export const metadata = { title: "Technical Journal" };

export default async function JournalIndex({ searchParams }: { searchParams: Promise<{ tag?: string; status?: string }> }) {
  const user = await requireUser();
  const { tag, status } = await searchParams;
  const statusFilter = status === "DRAFT" || status === "PUBLISHED" || status === "ARCHIVED" ? status : undefined;

  const [all, tags, filtered] = await Promise.all([
    db().journalPage.findMany({
      where: { ownerId: user.id, status: { not: "ARCHIVED" } },
      select: { id: true, title: true, parentId: true, icon: true, status: true },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    }),
    listTags(user.id),
    db().journalPage.findMany({
      where: {
        ownerId: user.id,
        ...(statusFilter ? { status: statusFilter } : { status: { not: "ARCHIVED" } }),
        ...(tag ? { tags: { some: { tag: { name: tag } } } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true, title: true, status: true, updatedAt: true, plainText: true, icon: true,
        tags: { select: { tag: { select: { name: true } } } },
        topic: { select: { title: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-4">
        <NewPageButton className="w-full" />
        <div>
          <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pages</h2>
          <PageTree pages={all} />
        </div>
        {tags.length ? (
          <div>
            <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tags</h2>
            <div className="flex flex-wrap gap-1.5 px-2">
              {tags.map((t) => (
                <Link key={t.id} href={tag === t.name ? "/journal" : `/journal?tag=${encodeURIComponent(t.name)}`}>
                  <Badge variant={tag === t.name ? "default" : "outline"}>#{t.name} <span className="opacity-60">{t._count.pages}</span></Badge>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </aside>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">My Technical Journal</h1>
            <p className="text-sm text-muted-foreground">
              {tag ? <>Pages tagged <strong>#{tag}</strong> · <Link className="underline" href="/journal">clear</Link></> : "Everything you have written, most recent first."}
            </p>
          </div>
          <div className="flex gap-1 text-xs">
            {[["", "Active"], ["DRAFT", "Drafts"], ["PUBLISHED", "Published"], ["ARCHIVED", "Archived"]].map(([v, l]) => (
              <Link
                key={l}
                href={v ? `/journal?status=${v}` : "/journal"}
                className={`rounded-md px-2.5 py-1 ${(statusFilter ?? "") === v ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {l}
              </Link>
            ))}
          </div>
        </div>
        {filtered.length === 0 ? (
          <Card className="grid place-items-center gap-3 p-12 text-center">
            <p className="text-sm text-muted-foreground">No pages here yet.</p>
            <NewPageButton variant="outline" />
          </Card>
        ) : (
          <div className="grid gap-3">
            {filtered.map((p) => (
              <Link key={p.id} href={`/journal/${p.id}`}>
                <Card className="p-4 transition-colors hover:border-primary/50">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {p.icon ? <span>{p.icon}</span> : null}
                        <h3 className="truncate font-medium">{p.title}</h3>
                        {p.status !== "DRAFT" ? <Badge variant={p.status === "PUBLISHED" ? "success" : "secondary"}>{p.status.toLowerCase()}</Badge> : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{preview(p.plainText, 220) || "Empty page"}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {p.topic ? <Badge variant="secondary">{p.topic.title}</Badge> : null}
                        {p.tags.map((t) => <span key={t.tag.name}>#{t.tag.name}</span>)}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(p.updatedAt)}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
