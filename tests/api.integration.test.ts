/**
 * Service/API-layer tests against a real PostgreSQL database.
 * Run with a disposable, migrated database:
 *   TEST_DATABASE_URL=postgresql://…/cloudops_test npx vitest run tests/api.integration.test.ts
 * Skipped automatically when TEST_DATABASE_URL is not set.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("journal, topics and search (PostgreSQL)", () => {
  let mod: {
    db: typeof import("@/lib/db").db;
    users: typeof import("@/server/users");
    pages: typeof import("@/server/pages");
    topics: typeof import("@/server/topics");
    cats: typeof import("@/server/categories");
    search: typeof import("@/server/search");
    bm: typeof import("@/server/bookmarks");
    doc: typeof import("@/domain/tiptap");
  };
  let alice: string;
  let bob: string;
  const tag = randomUUID().slice(0, 8);

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    mod = {
      db: (await import("@/lib/db")).db,
      users: await import("@/server/users"),
      pages: await import("@/server/pages"),
      topics: await import("@/server/topics"),
      cats: await import("@/server/categories"),
      search: await import("@/server/search"),
      bm: await import("@/server/bookmarks"),
      doc: await import("@/domain/tiptap"),
    };
    alice = (await mod.users.upsertUserOnSignIn({ email: `alice-${tag}@test.local`, name: "Alice", cognitoSub: `sub-a-${tag}` })).id;
    bob = (await mod.users.upsertUserOnSignIn({ email: `bob-${tag}@test.local`, name: "Bob", cognitoSub: null })).id;
  });

  afterAll(async () => {
    if (!mod) return;
    await mod.db().user.deleteMany({ where: { id: { in: [alice, bob] } } });
    await mod.db().$disconnect();
  });

  it("bootstraps the AWS, Azure and DevOps trees exactly once", async () => {
    const counts = await mod.db().category.groupBy({ by: ["track"], where: { ownerId: alice, parentId: null }, _count: true });
    expect(Object.fromEntries(counts.map((c) => [c.track, c._count]))).toEqual({ AWS: 14, AZURE: 8, DEVOPS: 9 });
    await mod.users.upsertUserOnSignIn({ email: `alice-${tag}@test.local`, name: "Alice", cognitoSub: `sub-a-${tag}` });
    expect(await mod.db().category.count({ where: { ownerId: alice, parentId: null } })).toBe(31);
  });

  it("refuses to link an email to a second Cognito identity", async () => {
    await expect(mod.users.upsertUserOnSignIn({ email: `alice-${tag}@test.local`, name: null, cognitoSub: "someone-else" })).rejects.toThrow();
  });

  it("isolates data between owners", async () => {
    const page = await mod.pages.createPage(alice, { title: "Alice private notes" });
    await expect(mod.pages.getPage(bob, page.id)).rejects.toMatchObject({ status: 404 });
    await expect(mod.pages.updatePage(bob, page.id, { title: "pwned" })).rejects.toMatchObject({ status: 404 });
    await expect(mod.pages.deletePage(bob, page.id)).rejects.toMatchObject({ status: 404 });
    await expect(mod.pages.createPage(bob, { title: "child", parentId: page.id })).rejects.toMatchObject({ status: 404 });
    await expect(mod.bm.toggleBookmark(bob, "PAGE", page.id)).rejects.toMatchObject({ status: 404 });
    expect(await mod.search.search(bob, "Alice private notes")).toHaveLength(0);
    expect((await mod.pages.getPage(alice, page.id)).title).toBe("Alice private notes");
  });

  it("gives unique slugs to pages with the same title", async () => {
    const a = await mod.pages.createPage(alice, { title: "Same title" });
    const b = await mod.pages.createPage(alice, { title: "Same title" });
    expect(a.slug).toBe("same-title");
    expect(b.slug).toBe("same-title-2");
  });

  it("autosaves, detects conflicts, versions and restores", async () => {
    const { doc, p } = mod.doc;
    const page = await mod.pages.createPage(alice, { title: "Versioned", content: doc(p("first")) });
    const saved = await mod.pages.updatePage(alice, page.id, { content: doc(p("second")), expectedUpdatedAt: page.updatedAt.toISOString() });
    await expect(
      mod.pages.updatePage(alice, page.id, { title: "stale", expectedUpdatedAt: page.updatedAt.toISOString() }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await mod.pages.getPage(alice, page.id)).plainText).toBe("second");

    const v2 = await mod.pages.snapshotPage(alice, page.id, "named");
    expect(v2.version).toBe(2);
    await mod.pages.restoreVersion(alice, page.id, 1);
    const restored = await mod.pages.getPage(alice, page.id);
    expect(restored.plainText).toBe("first");
    const versions = await mod.pages.listVersions(alice, page.id);
    expect(versions.map((v) => v.note)).toEqual(["Restored from v1", "Before restoring v1", "named", "Created"]);
    expect(saved.version).toBe(1);
  });

  it("prevents page cycles", async () => {
    const a = await mod.pages.createPage(alice, { title: "A" });
    const b = await mod.pages.createPage(alice, { title: "B", parentId: a.id });
    await expect(mod.pages.updatePage(alice, a.id, { parentId: b.id })).rejects.toMatchObject({ status: 400 });
    await expect(mod.pages.updatePage(alice, a.id, { parentId: a.id })).rejects.toMatchObject({ status: 400 });
  });

  it("normalises tags and replaces the set", async () => {
    const page = await mod.pages.createPage(alice, { title: "Tagged" });
    expect(await mod.pages.setPageTags(alice, page.id, ["#ALB", "alb", "Health Check"])).toEqual(["alb", "health-check"]);
    expect(await mod.pages.setPageTags(alice, page.id, ["ecs"])).toEqual(["ecs"]);
    const full = await mod.pages.getPage(alice, page.id);
    expect(full.tags.map((t) => t.tag.name)).toEqual(["ecs"]);
  });

  it("finds journal text, code and topic sections via full-text and substring search (scenario G)", async () => {
    const { doc, p, code } = mod.doc;
    await mod.pages.createPage(alice, {
      title: "ALB health check failing",
      content: doc(p("Targets unhealthy after deploy."), code("text", "Target.ResponseCodeMismatch [404]")),
    });
    const topic = await mod.db().topic.findFirstOrThrow({ where: { ownerId: alice, title: "Target Groups" } });
    await mod.topics.updateTopic(alice, topic.id, { section: { key: "cli", doc: doc(p("describe-target-health quirkyword")) } });

    const hits = await mod.search.search(alice, "alb health check");
    expect(hits[0]).toMatchObject({ kind: "page", title: "ALB health check failing" });
    expect((await mod.search.search(alice, "Target.ResponseCodeMismatch")).map((h) => h.kind)).toContain("page");
    expect((await mod.search.search(alice, "quirkyword"))[0]).toMatchObject({ kind: "topic", href: `/learn/aws/topic/${topic.id}` });
    expect((await mod.search.search(alice, "[404]")).length).toBeGreaterThan(0);
    expect(await mod.search.search(alice, "")).toEqual([]);
    expect((await mod.search.search(alice, "alb", { kinds: ["topic"] })).every((h) => h.kind === "topic")).toBe(true);
  });

  it("schedules reviews and records topic history", async () => {
    const topic = await mod.db().topic.findFirstOrThrow({ where: { ownerId: alice, title: "VPC" } });
    const prog = await mod.topics.setProgress(alice, topic.id, { status: "LEARNING", confidence: 3 });
    expect(prog.nextReviewAt).not.toBeNull();
    await mod.topics.updateTopic(alice, topic.id, { section: { key: "concept", doc: mod.doc.doc(mod.doc.p("isolated network")) } });
    const t = await mod.topics.getTopic(alice, topic.id);
    expect(t.sections.history?.at(-1)?.section).toBe("concept");
    await expect(mod.topics.updateTopic(alice, topic.id, { section: { key: "history", doc: mod.doc.doc() } })).rejects.toMatchObject({ status: 400 });
  });

  it("deleting a category cascades topics and cleans up bookmarks / recent views", async () => {
    const cat = await mod.cats.createCategory(alice, { track: "AWS", name: "Temp" });
    const sub = await mod.cats.createCategory(alice, { track: "AWS", name: "Temp child", parentId: cat.id });
    const topic = await mod.topics.createTopic(alice, { categoryId: sub.id, title: "Temp topic" });
    await mod.bm.toggleBookmark(alice, "TOPIC", topic.id);
    await mod.bm.recordView(alice, "TOPIC", topic.id, "Temp topic", "/x");
    await expect(mod.cats.updateCategory(alice, cat.id, { parentId: sub.id })).rejects.toMatchObject({ status: 400 });
    await expect(mod.cats.createCategory(alice, { track: "AZURE", name: "x", parentId: cat.id })).rejects.toMatchObject({ status: 400 });
    await mod.cats.deleteCategory(alice, cat.id);
    expect(await mod.db().topic.count({ where: { id: topic.id } })).toBe(0);
    expect(await mod.db().bookmark.count({ where: { entityId: topic.id } })).toBe(0);
    expect(await mod.db().recentView.count({ where: { entityId: topic.id } })).toBe(0);
  });
});
