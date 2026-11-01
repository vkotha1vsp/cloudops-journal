/**
 * Phase 2–5 service-layer tests against PostgreSQL (skipped without TEST_DATABASE_URL).
 * Walks acceptance scenarios A–G through the same functions the API routes call.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("studio, labs, troubleshooting, imports, assistant (PostgreSQL)", () => {
  let m: {
    db: typeof import("@/lib/db").db;
    users: typeof import("@/server/users");
    diagrams: typeof import("@/server/diagrams");
    labs: typeof import("@/server/labs");
    cases: typeof import("@/server/cases");
    imports: typeof import("@/server/imports");
    ai: typeof import("@/server/ai");
    search: typeof import("@/server/search");
    pages: typeof import("@/server/pages");
    build: typeof import("@/domain/architecture/build");
    parse: typeof import("@/domain/architecture/parse");
  };
  let me: string;
  let other: string;
  const tag = randomUUID().slice(0, 8);

  beforeAll(async () => {
    Object.assign(process.env, {
      DATABASE_URL: url,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? "test-secret-test-secret",
      AUTH_DEV_LOGIN: "true",
      AUTH_DEV_PASSWORD: "test-password",
      ALLOWED_EMAILS: "x@test.local",
      COGNITO_CLIENT_ID: "",
      COGNITO_ISSUER: "",
      S3_ATTACHMENTS_BUCKET: "",
      AI_PROVIDER: "none",
    });
    m = {
      db: (await import("@/lib/db")).db,
      users: await import("@/server/users"),
      diagrams: await import("@/server/diagrams"),
      labs: await import("@/server/labs"),
      cases: await import("@/server/cases"),
      imports: await import("@/server/imports"),
      ai: await import("@/server/ai"),
      search: await import("@/server/search"),
      pages: await import("@/server/pages"),
      build: await import("@/domain/architecture/build"),
      parse: await import("@/domain/architecture/parse"),
    };
    me = (await m.users.upsertUserOnSignIn({ email: `p-${tag}@test.local`, name: "P", cognitoSub: null })).id;
    other = (await m.users.upsertUserOnSignIn({ email: `o-${tag}@test.local`, name: "O", cognitoSub: null })).id;
  });

  afterAll(async () => {
    if (!m) return;
    await m.db().user.deleteMany({ where: { id: { in: [me, other] } } });
    await m.db().$disconnect();
  });

  let diagramId = "";
  let topicId = "";

  it("A/C: generates, saves and files a diagram as a page under an AWS topic", async () => {
    const parsed = m.parse.parseRequest("Create an AWS architecture using Route 53, an Application Load Balancer, Target Group, two EC2 instances, Security Groups, and RDS.");
    const { graph, assumptions } = m.build.generate(parsed);
    topicId = (await m.db().topic.findFirstOrThrow({ where: { ownerId: me, title: "Application Load Balancer" } })).id;
    const created = await m.diagrams.createDiagram(me, { title: `ALB web ${tag}`, provider: "aws", topicId, graph, assumptions });
    diagramId = created.id;
    const d = await m.diagrams.getDiagram(me, diagramId);
    expect(d.graph.nodes.filter((n) => n.kind === "ec2")).toHaveLength(2);
    expect(await m.db().animationScenario.count({ where: { diagramId } })).toBeGreaterThan(2);
    const { id: pageId } = await m.diagrams.saveDiagramAsPage(me, diagramId, {});
    const page = await m.pages.getPage(me, pageId);
    expect(page.topicId).toBe(topicId);
    expect(JSON.stringify(page.content)).toContain("architectureEmbed");
    await expect(m.diagrams.getDiagram(other, diagramId)).rejects.toMatchObject({ status: 404 });
  });

  it("D: editing saves a new version and rejects stale writes", async () => {
    const d = await m.diagrams.getDiagram(me, diagramId);
    const graph = { ...d.graph, nodes: d.graph.nodes.map((n) => (n.kind === "rds" ? { ...n, label: "Primary DB" } : n)) };
    const saved = await m.diagrams.saveDiagram(me, diagramId, { title: d.title, provider: "aws", graph, expectedVersion: d.currentVersion });
    expect(saved.version).toBe(d.currentVersion + 1);
    await expect(m.diagrams.saveDiagram(me, diagramId, { title: d.title, provider: "aws", graph, expectedVersion: d.currentVersion })).rejects.toMatchObject({ status: 409 });
    const v1 = await m.diagrams.getDiagramVersion(me, diagramId, 1);
    expect(JSON.stringify(v1)).not.toContain("Primary DB");
  });

  let labId = "";
  it("starts a lab from a template, records progress and timestamps", async () => {
    labId = (await m.labs.createLab(me, { templateId: "alb-target-groups", topicId })).id;
    const lab = await m.labs.getLab(me, labId);
    expect(lab.steps.length).toBeGreaterThan(3);
    const updated = await m.labs.updateLab(me, labId, {
      status: "IN_PROGRESS",
      diagramId,
      errorsEncountered: `Target.ResponseCodeMismatch ${tag}: health checks failed with these codes: [404]`,
      rootCause: "Health check path /health did not exist",
      steps: lab.steps.map((s, i) => ({ title: s.title, instruction: s.instruction, commands: s.commands, expected: s.expected, actual: i === 0 ? "worked" : "", done: i === 0 })),
    });
    expect(updated.startedAt).not.toBeNull();
    expect(updated.steps[0]!.done).toBe(true);
    expect(updated.diagram?.id).toBe(diagramId);
    await expect(m.labs.updateLab(other, labId, { title: "x" })).rejects.toMatchObject({ status: 404 });
    await expect(m.labs.updateLab(other, (await m.labs.createLab(other, { title: "o" })).id, { diagramId })).rejects.toMatchObject({ status: 404 });
  });

  it("G: a troubleshooting case links lab + diagram and is found by its error text", async () => {
    const c = await m.cases.createCase(me, {
      title: `ALB health check 404 ${tag}`,
      errorMessage: `Target.ResponseCodeMismatch ${tag}`,
      area: "aws",
      services: ["ALB", "EC2"],
      symptoms: "502 from the ALB", rootCause: "wrong path", investigation: "aws elbv2 describe-target-health", resolution: "set /", verification: "healthy", prevention: "",
      labIds: [labId],
      diagramIds: [diagramId],
    });
    const hits = await m.search.search(me, `ResponseCodeMismatch ${tag}`);
    expect(hits.map((h) => h.kind)).toEqual(expect.arrayContaining(["troubleshooting", "lab"]));
    const got = await m.cases.getCase(me, c.id);
    expect(got.labs[0]!.id).toBe(labId);
    expect(got.diagrams[0]!.id).toBe(diagramId);
    expect((await m.cases.listCases(me, { area: "aws", q: tag })).length).toBe(1);
    await expect(m.cases.createCase(other, { ...got, labIds: [labId], diagramIds: [], services: [], area: "aws" })).rejects.toMatchObject({ status: 404 });
  });

  it("E: imports a ChatGPT DOCX and Markdown paste, then saves with attribution", async () => {
    const buf = readFileSync(path.join(__dirname, "fixtures/chatgpt-export.docx"));
    const docx = await m.imports.createImport(me, { fileName: "chatgpt-export.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buf });
    expect(docx.title).toBe("ALB health checks explained");
    expect(docx.html).toContain("<table>");
    expect(docx.detected.services.map((s) => s.kind)).toContain("alb");
    expect(docx.suggestions.some((s) => s.title === "Application Load Balancer" || s.title === "Health Checks")).toBe(true);

    const paste = await m.imports.createImport(me, { fileName: "ChatGPT paste", mime: "text/markdown", buf: Buffer.from("# VPC notes\n\n```mermaid\ngraph TD; A-->B\n```\n"), paste: true });
    expect(paste.detected.mermaidBlocks).toBe(1);
    const { pageId } = await m.imports.saveImport(me, paste.id, { title: "VPC notes", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }] } });
    const page = await m.pages.getPage(me, pageId);
    expect(page.content.content![0]!.type).toBe("callout");
    await expect(m.imports.saveImport(me, paste.id, { title: "again", content: { type: "doc", content: [] } })).rejects.toMatchObject({ status: 409 });
    await expect(m.imports.saveImport(other, docx.id, { title: "steal", content: { type: "doc", content: [] } })).rejects.toMatchObject({ status: 404 });
    await expect(m.imports.createImport(me, { fileName: "fake.pdf", mime: "application/pdf", buf: Buffer.from("not a pdf") })).rejects.toMatchObject({ status: 415 });
  });

  it("assistant without a provider still returns grounded journal sources", async () => {
    const r = await m.ai.ask(me, { kind: "troubleshoot", prompt: `ResponseCodeMismatch ${tag}`, diagramId });
    expect(r.enabled).toBe(false);
    expect(r.sources[0]).toMatchObject({ kind: "diagram", id: diagramId });
    expect(r.sources.some((s) => s.kind === "troubleshooting")).toBe(true);
    await expect(m.ai.ask(other, { kind: "question", prompt: "anything", diagramId })).rejects.toMatchObject({ status: 404 });
  });

  it("F: Azure generation saves under the Azure journey", async () => {
    const parsed = m.parse.parseRequest("Azure Front Door, Application Gateway, two VMs and Azure SQL");
    expect(parsed.provider).toBe("azure");
    const azTopic = await m.db().topic.findFirstOrThrow({ where: { ownerId: me, title: "Application Gateway" }, include: { category: true } });
    const { graph } = m.build.generate(parsed);
    const d = await m.diagrams.createDiagram(me, { title: `Azure ${tag}`, provider: "azure", topicId: azTopic.id, graph });
    const { id: pageId } = await m.diagrams.saveDiagramAsPage(me, d.id, {});
    expect((await m.pages.getPage(me, pageId)).topic?.category.track).toBe("AZURE");
  });
});
