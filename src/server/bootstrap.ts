import { db } from "@/lib/db";
import { slugify } from "@/domain/slug";
import { TREES, type TreeSeed } from "@/domain/knowledge-trees";
import type { Track } from "@/generated/prisma/enums";

/** Creates the default AWS / Azure / DevOps trees if the user has no categories for a track. */
export async function bootstrapKnowledgeTrees(ownerId: string) {
  const prisma = db();
  for (const [track, seeds] of Object.entries(TREES) as [Track, TreeSeed[]][]) {
    const count = await prisma.category.count({ where: { ownerId, track } });
    if (count > 0) continue;
    await prisma.$transaction(async (tx) => {
      const create = async (seed: TreeSeed, order: number, parentId: string | null) => {
        const cat = await tx.category.create({
          data: { ownerId, track, parentId, name: seed.name, slug: slugify(seed.name), icon: seed.icon, sortOrder: order },
        });
        if (seed.topics.length) {
          await tx.topic.createMany({
            data: seed.topics.map((title, i) => ({
              ownerId,
              categoryId: cat.id,
              title,
              slug: slugify(title),
              sortOrder: i,
            })),
          });
        }
        for (const [i, child] of (seed.children ?? []).entries()) await create(child, i, cat.id);
      };
      for (const [i, seed] of seeds.entries()) await create(seed, i, null);
    }, { timeout: 30_000 });
  }
}
