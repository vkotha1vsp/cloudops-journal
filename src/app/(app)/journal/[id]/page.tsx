import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { getPage } from "@/server/pages";
import { isBookmarked, recordView } from "@/server/bookmarks";
import { PageEditor } from "@/components/journal/page-editor";

export default async function JournalPageView({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let page;
  try {
    page = await getPage(user.id, id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }

  const [pages, topics, bookmarked] = await Promise.all([
    db().journalPage.findMany({
      where: { ownerId: user.id, id: { not: id }, status: { not: "ARCHIVED" } },
      select: { id: true, title: true, parentId: true },
      orderBy: { title: "asc" },
    }),
    db().topic.findMany({
      where: { ownerId: user.id },
      select: { id: true, title: true, category: { select: { name: true, track: true } } },
      orderBy: [{ category: { track: "asc" } }, { title: "asc" }],
    }),
    isBookmarked(user.id, "PAGE", id),
    recordView(user.id, "PAGE", id, page.title, `/journal/${id}`),
  ]);

  // Exclude descendants from the parent picker so a page cannot be moved under itself.
  const descendants = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of pages) if (p.parentId && descendants.has(p.parentId) && !descendants.has(p.id)) { descendants.add(p.id); grew = true; }
  }

  return (
    <PageEditor
      key={page.id}
      bookmarked={bookmarked}
      page={{
        id: page.id,
        title: page.title,
        icon: page.icon,
        content: page.content,
        status: page.status,
        parentId: page.parentId,
        topicId: page.topicId,
        updatedAt: page.updatedAt.toISOString(),
        version: page.version,
        tags: page.tags.map((t) => t.tag.name),
      }}
      parentOptions={pages.filter((p) => !descendants.has(p.id))}
      topicOptions={topics.map((t) => ({ id: t.id, title: t.title, group: `${t.category.track} · ${t.category.name}` }))}
    />
  );
}
