import { db } from "@/lib/db";
import { slugify } from "@/domain/slug";
import { bootstrapKnowledgeTrees } from "@/server/bootstrap";

/**
 * Called on every sign-in. Links a Cognito subject to the user on first login and creates
 * the default workspace and knowledge trees exactly once.
 */
export async function upsertUserOnSignIn(input: { email: string; name: string | null; cognitoSub: string | null }) {
  const email = input.email.trim().toLowerCase();
  const prisma = db();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (input.cognitoSub && existing.cognitoSub && existing.cognitoSub !== input.cognitoSub) {
      // Same email, different Cognito identity: refuse rather than silently merge accounts.
      throw new Error("This email is already linked to a different identity");
    }
    if (input.cognitoSub && !existing.cognitoSub) {
      return prisma.user.update({ where: { id: existing.id }, data: { cognitoSub: input.cognitoSub } });
    }
    return existing;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: input.name,
      cognitoSub: input.cognitoSub,
      workspaces: { create: { name: "Personal", slug: slugify("personal") } },
    },
  });
  await bootstrapKnowledgeTrees(user.id);
  return user;
}

export async function getUser(id: string) {
  return db().user.findUnique({ where: { id }, select: { id: true, email: true, name: true, preferences: true, createdAt: true } });
}
