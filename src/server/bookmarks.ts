import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { slugFromTrack } from "@/domain/tracks";
import type { EntityType } from "@/generated/prisma/enums";

/** Resolve label/href server-side from the owned entity, so clients cannot bookmark arbitrary URLs. */
async function resolveEntity(ownerId: string, entityType: EntityType, entityId: string) {
  const prisma = db();
  switch (entityType) {
    case "PAGE": {
      const p = await prisma.journalPage.findFirst({ where: { id: entityId, ownerId }, select: { title: true } });
      return p && { label: p.title, href: `/journal/${entityId}` };
    }
    case "TOPIC": {
      const t = await prisma.topic.findFirst({ where: { id: entityId, ownerId }, select: { title: true, category: { select: { track: true } } } });
      return t && { label: t.title, href: `/learn/${slugFromTrack(t.category.track)}/topic/${entityId}` };
    }
    case "DIAGRAM": {
      const d = await prisma.architectureDiagram.findFirst({ where: { id: entityId, ownerId }, select: { title: true } });
      return d && { label: d.title, href: `/studio?diagram=${entityId}` };
    }
    case "LAB": {
      const l = await prisma.lab.findFirst({ where: { id: entityId, ownerId }, select: { title: true } });
      return l && { label: l.title, href: `/labs?focus=${entityId}` };
    }
    case "TROUBLESHOOTING": {
      const c = await prisma.troubleshootingCase.findFirst({ where: { id: entityId, ownerId }, select: { title: true } });
      return c && { label: c.title, href: `/troubleshooting?focus=${entityId}` };
    }
    case "CATEGORY": {
      const c = await prisma.category.findFirst({ where: { id: entityId, ownerId }, select: { name: true, track: true } });
      return c && { label: c.name, href: `/learn/${slugFromTrack(c.track)}?category=${entityId}` };
    }
  }
}

export async function toggleBookmark(ownerId: string, entityType: EntityType, entityId: string) {
  const prisma = db();
  const existing = await prisma.bookmark.findUnique({ where: { ownerId_entityType_entityId: { ownerId, entityType, entityId } } });
  if (existing) {
    await prisma.bookmark.delete({ where: { id: existing.id } });
    return { bookmarked: false };
  }
  const resolved = await resolveEntity(ownerId, entityType, entityId);
  if (!resolved) throw notFound("Item");
  await prisma.bookmark.create({ data: { ownerId, entityType, entityId, ...resolved } });
  return { bookmarked: true };
}

export async function isBookmarked(ownerId: string, entityType: EntityType, entityId: string) {
  const b = await db().bookmark.findUnique({ where: { ownerId_entityType_entityId: { ownerId, entityType, entityId } }, select: { id: true } });
  return Boolean(b);
}

export async function listBookmarks(ownerId: string, entityType?: EntityType) {
  return db().bookmark.findMany({ where: { ownerId, ...(entityType ? { entityType } : {}) }, orderBy: { createdAt: "desc" } });
}

export async function recordView(ownerId: string, entityType: EntityType, entityId: string, label: string, href: string) {
  await db().recentView.upsert({
    where: { ownerId_entityType_entityId: { ownerId, entityType, entityId } },
    create: { ownerId, entityType, entityId, label, href },
    update: { label, href, viewedAt: new Date() },
  });
}

export async function recentViews(ownerId: string, take = 8) {
  return db().recentView.findMany({ where: { ownerId }, orderBy: { viewedAt: "desc" }, take });
}

/** Remove bookmarks and recent-view rows that point at deleted entities. */
export async function forgetEntities(ownerId: string, entityType: EntityType, entityIds: string[]) {
  if (!entityIds.length) return;
  const where = { ownerId, entityType, entityId: { in: entityIds } };
  await db().$transaction([db().bookmark.deleteMany({ where }), db().recentView.deleteMany({ where })]);
}
