import { db } from "@/lib/db";
import type { Track } from "@/generated/prisma/enums";

export type TrackProgress = { categoryId: string; name: string; total: number; started: number; mastered: number };

async function trackProgress(ownerId: string, track: Track): Promise<TrackProgress[]> {
  const prisma = db();
  const roots = await prisma.category.findMany({
    where: { ownerId, track, parentId: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
  const topics = await prisma.topic.findMany({
    where: { ownerId, category: { track } },
    select: { categoryId: true, category: { select: { parentId: true } }, progress: { where: { ownerId }, select: { status: true } } },
  });
  // Attribute each topic to its root category (one level of nesting covered by default trees; deeper nests roll up via parent).
  const parentOf = new Map<string, string | null>();
  const cats = await prisma.category.findMany({ where: { ownerId, track }, select: { id: true, parentId: true } });
  for (const c of cats) parentOf.set(c.id, c.parentId);
  const rootOf = (id: string): string => {
    let cur = id;
    for (let i = 0; i < 50; i++) {
      const p = parentOf.get(cur);
      if (!p) return cur;
      cur = p;
    }
    return cur;
  };
  const stats = new Map(roots.map((r) => [r.id, { categoryId: r.id, name: r.name, total: 0, started: 0, mastered: 0 }]));
  for (const t of topics) {
    const s = stats.get(rootOf(t.categoryId));
    if (!s) continue;
    s.total++;
    const status = t.progress[0]?.status ?? "NOT_STARTED";
    if (status !== "NOT_STARTED") s.started++;
    if (status === "MASTERED") s.mastered++;
  }
  return [...stats.values()];
}

export async function dashboardData(ownerId: string) {
  const prisma = db();
  const now = new Date();
  const [pageCount, topicCount, reviewDue, activeLabs, recentPages, dueTopics, aws, azure, diagrams, savedCases, labs] =
    await Promise.all([
      prisma.journalPage.count({ where: { ownerId, status: { not: "ARCHIVED" } } }),
      prisma.topic.count({ where: { ownerId } }),
      prisma.learningProgress.count({ where: { ownerId, nextReviewAt: { lte: now } } }),
      prisma.lab.count({ where: { ownerId, status: { in: ["IN_PROGRESS", "BLOCKED"] } } }),
      prisma.journalPage.findMany({
        where: { ownerId, status: { not: "ARCHIVED" } },
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: { id: true, title: true, updatedAt: true, status: true, plainText: true },
      }),
      prisma.learningProgress.findMany({
        where: { ownerId, nextReviewAt: { not: null } },
        orderBy: { nextReviewAt: "asc" },
        take: 6,
        select: { nextReviewAt: true, status: true, confidence: true, topic: { select: { id: true, title: true, category: { select: { track: true } } } } },
      }),
      trackProgress(ownerId, "AWS"),
      trackProgress(ownerId, "AZURE"),
      prisma.architectureDiagram.findMany({ where: { ownerId }, orderBy: { updatedAt: "desc" }, take: 4, select: { id: true, title: true, provider: true, updatedAt: true } }),
      prisma.bookmark.findMany({ where: { ownerId, entityType: "TROUBLESHOOTING" }, orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.lab.findMany({ where: { ownerId, status: { in: ["IN_PROGRESS", "BLOCKED"] } }, orderBy: { updatedAt: "desc" }, take: 4, select: { id: true, title: true, status: true } }),
    ]);
  return { pageCount, topicCount, reviewDue, activeLabs, recentPages, dueTopics, aws, azure, diagrams, savedCases, labs };
}
