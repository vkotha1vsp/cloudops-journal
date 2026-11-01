import Link from "next/link";
import { Star } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listBookmarks } from "@/server/bookmarks";
import { relativeTime } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Bookmarks" };

export default async function BookmarksPage() {
  const user = await requireUser();
  const items = await listBookmarks(user.id);
  const groups = [...new Set(items.map((i) => i.entityType))];
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Saved resources and bookmarks</h1>
        <p className="text-sm text-muted-foreground">Use the ☆ button on any page or topic to save it here.</p>
      </div>
      {items.length === 0 ? (
        <Card className="grid place-items-center gap-2 p-12 text-center text-sm text-muted-foreground">
          <Star className="size-6" />
          Nothing bookmarked yet.
        </Card>
      ) : (
        groups.map((g) => (
          <section key={g} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.toLowerCase().replace("_", " ")}s</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.filter((i) => i.entityType === g).map((b) => (
                <Link key={b.id} href={b.href}>
                  <Card className="flex items-center justify-between gap-2 p-3 text-sm hover:border-primary/50">
                    <span className="truncate font-medium">{b.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(b.createdAt)}</span>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
