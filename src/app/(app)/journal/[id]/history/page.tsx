import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { HttpError } from "@/lib/errors";
import { getPage, listVersions } from "@/server/pages";
import { HistoryView } from "@/components/journal/history-view";

export const metadata = { title: "Revision history" };

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  try {
    const [page, versions] = await Promise.all([getPage(user.id, id), listVersions(user.id, id)]);
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="text-sm">
          <Link href={`/journal/${id}`} className="text-muted-foreground hover:text-foreground">← Back to “{page.title}”</Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Revision history</h1>
        <HistoryView
          pageId={id}
          versions={versions.map((v) => ({ version: v.version, title: v.title, note: v.note, createdAt: v.createdAt.toISOString(), chars: v.plainText.length }))}
        />
      </div>
    );
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
}
