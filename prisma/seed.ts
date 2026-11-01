/**
 * Seed sample data for the admin user (idempotent: safe to run more than once).
 *   npm run db:seed
 * Knowledge trees are created automatically on first sign-in; this script also creates them
 * up front so the app is populated before you log in.
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { upsertUserOnSignIn } from "../src/server/users";
import { createPage, setPageTags } from "../src/server/pages";
import { updateTopic, setProgress } from "../src/server/topics";
import { bullets, callout, code, doc, h, p, type TiptapNode } from "../src/domain/tiptap";
import type { Prisma } from "../src/generated/prisma/client";
import { sampleAwsGraph, sampleAzureGraph, type SampleGraph as Graph } from "../src/domain/architecture/samples";

const seedEmail = process.env.SEED_ADMIN_EMAIL ?? process.env.ALLOWED_EMAILS?.split(",")[0]?.trim();
if (!seedEmail) throw new Error("Set SEED_ADMIN_EMAIL (or ALLOWED_EMAILS) before seeding");
const email: string = seedEmail;

async function main() {
  const prisma = db();
  const user = await upsertUserOnSignIn({ email, name: process.env.SEED_ADMIN_NAME ?? null, cognitoSub: null });
  const ownerId = user.id;
  console.log(`Seeding for ${email} (${ownerId})`);

  const findTopic = (title: string, track: "AWS" | "AZURE" | "DEVOPS") =>
    prisma.topic.findFirst({ where: { ownerId, title, category: { track } } });

  // ── Topic content: Application Load Balancer ──────────────────────────────
  const alb = await findTopic("Application Load Balancer", "AWS");
  if (alb && !(alb.sections as Record<string, unknown>)?.concept) {
    const sections: [string, TiptapNode][] = [
      ["concept", doc(p("A layer-7 load balancer that terminates HTTP/HTTPS, evaluates listener rules, and forwards each request to a target group."))],
      ["why", doc(p("Spreads traffic across healthy targets in multiple Availability Zones and routes by host, path, header or query string, so one entry point can serve many services."))],
      ["terminology", doc(bullets(
        "Listener: a port + protocol the ALB accepts (e.g. HTTPS:443) with an ordered list of rules.",
        "Rule: conditions (host, path…) and an action (forward, redirect, fixed response).",
        "Target group: a routing configuration naming targets, target port/protocol and the health check. It is not a network hop.",
        "Health check: the ALB's own periodic probe, separate from user traffic.",
      ))],
      ["flow", doc(bullets(
        "Client resolves learn.example.com via Route 53 (DNS only, Route 53 does not proxy the request).",
        "Client opens a TLS connection to the ALB's listener on 443; the ACM certificate terminates TLS.",
        "Listener rules are evaluated in priority order; the matching rule forwards to a target group.",
        "The target group picks a healthy target and the ALB sends the request to it on the target port.",
        "The target's security group must allow inbound from the ALB's security group on that port.",
      ))],
      ["cli", doc(code("bash", "aws elbv2 describe-target-health \\\n  --target-group-arn \"$TG_ARN\" \\\n  --query 'TargetHealthDescriptions[].{id:Target.Id,state:TargetHealth.State,reason:TargetHealth.Reason}'"))],
      ["terraform", doc(code("hcl", "resource \"aws_lb_target_group\" \"app\" {\n  port        = 3000\n  protocol    = \"HTTP\"\n  target_type = \"ip\"\n  vpc_id      = var.vpc_id\n  health_check {\n    path    = \"/api/health\"\n    matcher = \"200\"\n  }\n}"))],
      ["security", doc(callout("warning", "Allow the target security group to accept traffic only from the ALB security group, not from 0.0.0.0/0."))],
      ["errors", doc(bullets("502 Bad Gateway: target closed the connection or returned a malformed response.", "503: no healthy targets registered.", "Target.FailedHealthChecks / Target.ResponseCodeMismatch in describe-target-health."))],
    ];
    for (const [key, d] of sections) await updateTopic(ownerId, alb.id, { section: { key: key as never, doc: d } });
    await updateTopic(ownerId, alb.id, { summary: "Layer-7 load balancing with listener rules and target groups." });
    await setProgress(ownerId, alb.id, { status: "LEARNING", confidence: 3 });
  }
  for (const [title, track, status, confidence] of [
    ["VPC", "AWS", "REVIEWING", 4],
    ["Security Groups", "AWS", "LEARNING", 2],
    ["Route 53", "AWS", "LEARNING", 2],
    ["Virtual Networks and Subnets", "AZURE", "LEARNING", 1],
    ["Docker images", "DEVOPS", "MASTERED", 5],
  ] as const) {
    const t = await findTopic(title, track);
    if (t) await setProgress(ownerId, t.id, { status, confidence });
  }

  // ── Journal pages ─────────────────────────────────────────────────────────
  const existing = new Set((await prisma.journalPage.findMany({ where: { ownerId }, select: { title: true } })).map((x) => x.title));

  if (!existing.has("Welcome to CloudOps Journal")) {
    const welcome = await createPage(ownerId, {
      title: "Welcome to CloudOps Journal",
      icon: "👋",
      content: doc(
        p("This is your private technical journal. Pages autosave, keep a version history, and are searchable, including code blocks and error output."),
        h(2, "Things to try"),
        { type: "taskList", content: ["Link this page to a learning topic", "Add a tag", "Save a named version, then restore it from History", "Search for a command you wrote"].map((t, i) => ({ type: "taskItem", attrs: { checked: i === 0 }, content: [p(t)] })) },
        callout("tip", "Press Ctrl/⌘ + K anywhere to jump to search."),
      ),
    });
    await setPageTags(ownerId, welcome.id, ["getting-started"]);
  }

  if (!existing.has("ALB returns 502 after deploy: health checks failing")) {
    const albPage = await createPage(ownerId, {
      title: "ALB returns 502 after deploy: health checks failing",
      topicId: alb?.id ?? null,
      content: doc(
        p("After a new task definition rolled out, the ALB started returning 502 and the target group showed all targets unhealthy."),
        h(2, "What I saw"),
        code("text", "Target.FailedHealthChecks  Health checks failed\nReason: Target.ResponseCodeMismatch  Health checks failed with these codes: [404]"),
        h(2, "Root cause"),
        p("The new build moved the health endpoint to /api/health but the target group still probed /health, so every check returned 404."),
        h(2, "Fix"),
        code("bash", "aws elbv2 modify-target-group --target-group-arn \"$TG_ARN\" \\\n  --health-check-path /api/health --matcher HttpCode=200"),
        callout("info", "Health checks are the ALB's own probe. They are independent of user requests and fail even when real traffic would succeed."),
      ),
    });
    await setPageTags(ownerId, albPage.id, ["alb", "health-check", "troubleshooting"]);
  }

  if (!existing.has("Interview prep: VPC networking")) {
    const parent = await createPage(ownerId, { title: "Interview prep: VPC networking", icon: "🧭", content: doc(p("Questions I want to be able to answer without notes.")) });
    await createPage(ownerId, {
      title: "Public vs private subnets",
      parentId: parent.id,
      content: doc(
        p("A subnet is public only because its route table sends 0.0.0.0/0 to an Internet Gateway. Private subnets reach the internet only through a NAT gateway or not at all; VPC endpoints give private access to AWS services."),
        { type: "table", content: [
          { type: "tableRow", content: ["Subnet", "Default route", "Inbound from internet"].map((t) => ({ type: "tableHeader", content: [p(t)] })) },
          { type: "tableRow", content: ["Public", "igw-…", "Yes, with public IP + SG"].map((t) => ({ type: "tableCell", content: [p(t)] })) },
          { type: "tableRow", content: ["Private", "nat-… or none", "No"].map((t) => ({ type: "tableCell", content: [p(t)] })) },
        ] },
      ),
    });
  }

  // ── Troubleshooting case + lab (Phase 5 modules; seeded so search already finds them) ──
  const awsGraph = sampleAwsGraph();
  let diagram = await prisma.architectureDiagram.findFirst({ where: { ownerId, title: "Web app behind ALB (sample)" } });
  if (!diagram) {
    diagram = await createDiagram(ownerId, "Web app behind ALB (sample)", "Route 53 → ALB (HTTPS) → target group → two EC2 instances in private subnets across two AZs.", "aws", alb?.id ?? null, awsGraph);
    const scenario = await prisma.animationScenario.create({
      data: { diagramId: diagram.id, mode: "normal", title: "Normal HTTPS request", description: "Simulation, not live monitoring." },
    });
    await prisma.animationStep.createMany({
      data: [
        ["DNS resolution", "The browser asks Route 53 for learn.example.com and receives the ALB's alias address. Route 53 is not in the request path after this.", ["user", "r53"], ["e-dns"]],
        ["TLS to the ALB", "The browser opens HTTPS to the ALB listener on 443. TLS terminates with the ACM certificate.", ["user", "alb"], ["e-https"]],
        ["Listener rule", "The HTTPS:443 listener evaluates its rules in priority order; the default rule forwards to the app target group.", ["alb", "tg"], ["e-fwd"]],
        ["Target selection", "The target group chooses a healthy registered target (round robin by default).", ["tg", "ec2a", "ec2b"], ["e-reg-a", "e-reg-b"]],
        ["Request reaches EC2", "The ALB sends the request to the instance on port 3000. The instance's security group allows 3000 only from the ALB's security group.", ["ec2a"], ["e-reg-a"]],
        ["Response", "The application responds; the ALB returns it to the browser over the same connection.", ["ec2a", "alb", "user"], ["e-https"]],
      ].map(([title, explanation, nodeKeys, edgeKeys], i) => ({
        scenarioId: scenario.id, order: i + 1, title: title as string, explanation: explanation as string,
        nodeKeys: nodeKeys as string[], edgeKeys: edgeKeys as string[],
      })),
    });
  }
  if (!(await prisma.architectureDiagram.findFirst({ where: { ownerId, title: "Azure web tier (sample)" } }))) {
    const vnet = await findTopic("Application Gateway", "AZURE");
    await createDiagram(ownerId, "Azure web tier (sample)", "Front Door → Application Gateway (WAF) → VM scale set in a private subnet, NSG on the subnet.", "azure", vnet?.id ?? null, sampleAzureGraph());
  }

  let lab = await prisma.lab.findFirst({ where: { ownerId, slug: "alb-and-target-groups" } });
  if (!lab) {
    lab = await prisma.lab.create({
      data: {
        ownerId, slug: "alb-and-target-groups", title: "ALB and target groups", topicId: alb?.id, diagramId: diagram.id, isTemplate: true,
        objective: "Put two EC2 web servers behind an Application Load Balancer and observe health checks.",
        prerequisites: "A VPC with two public and two private subnets; AWS CLI configured.",
        estimatedCost: "≈ $0.03/hour for the ALB plus two t3.micro instances. Delete everything afterwards.",
        expectedResults: "Both targets healthy; refreshing the ALB DNS name alternates between instances.",
        errorsEncountered: "Targets stayed unhealthy: Target.Timeout on health checks.",
        rootCause: "Instance security group allowed port 80 from my IP only, not from the ALB security group.",
        resolution: "Added an inbound rule on port 80 with the ALB security group as the source.",
        cleanup: "Delete the ALB, target group, instances and security groups.",
        status: "IN_PROGRESS", startedAt: new Date(),
        steps: { create: [
          { order: 1, title: "Launch two instances with Nginx", commands: "sudo dnf install -y nginx && sudo systemctl enable --now nginx" },
          { order: 2, title: "Create target group", commands: "aws elbv2 create-target-group --name web-tg --protocol HTTP --port 80 --vpc-id $VPC_ID --health-check-path /" },
          { order: 3, title: "Create ALB and listener", commands: "aws elbv2 create-load-balancer --name web-alb --subnets $PUB_A $PUB_B --security-groups $ALB_SG" },
          { order: 4, title: "Check target health", commands: "aws elbv2 describe-target-health --target-group-arn $TG_ARN" },
        ] },
      },
    });
  }

  if (!(await prisma.troubleshootingCase.findFirst({ where: { ownerId, title: "ALB targets unhealthy: health check path returns 404" } }))) {
    await prisma.troubleshootingCase.create({
      data: {
        ownerId, area: "aws", services: ["ALB", "Target Group", "ECS"],
        title: "ALB targets unhealthy: health check path returns 404",
        errorMessage: "Target.ResponseCodeMismatch Health checks failed with these codes: [404]",
        symptoms: "ALB returns 502/503 to users; all targets unhealthy in the target group.",
        rootCause: "Health check path did not exist in the new application build.",
        investigation: "aws elbv2 describe-target-health --target-group-arn $TG_ARN\ncurl -i http://<target-ip>:3000/api/health",
        resolution: "Point the target group health check at /api/health and require HTTP 200.",
        verification: "describe-target-health shows healthy for every target; ALB returns 200.",
        prevention: "Keep the health endpoint stable and covered by a test; set it in Terraform rather than the console.",
        diagrams: { connect: { id: diagram.id } },
        labs: { connect: { id: lab.id } },
      },
    });
  }

  console.log("Seed complete.");
}


async function createDiagram(ownerId: string, title: string, description: string, provider: string, topicId: string | null, g: Graph) {
  const prisma = db();
  return prisma.$transaction(async (tx) => {
    const d = await tx.architectureDiagram.create({
      data: { ownerId, title, description, provider, topicId, layout: { boundaries: g.boundaries } as unknown as Prisma.InputJsonValue },
    });
    const ids = new Map<string, string>();
    for (const n of g.nodes) {
      const node = await tx.architectureNode.create({
        data: { diagramId: d.id, key: n.key, kind: n.kind, role: n.role, label: n.label, boundaryId: n.boundaryId, config: (n.config ?? {}) as Prisma.InputJsonValue, positionX: n.x, positionY: n.y },
      });
      ids.set(n.key, node.id);
    }
    for (const e of g.edges) {
      await tx.architectureEdge.create({
        data: { diagramId: d.id, key: e.key, sourceId: ids.get(e.source)!, targetId: ids.get(e.target)!, relation: e.relation, protocol: e.protocol, port: e.port, label: e.label },
      });
    }
    await tx.architectureDiagramVersion.create({ data: { diagramId: d.id, version: 1, graph: g as unknown as Prisma.InputJsonValue, note: "Seed" } });
    return d;
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
