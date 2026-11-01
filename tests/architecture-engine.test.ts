import { describe, expect, it } from "vitest";
import { parseRequest } from "@/domain/architecture/parse";
import { generate } from "@/domain/architecture/build";
import { hasErrors, validateGraph } from "@/domain/architecture/graph";
import { boundaryRects, NODE_H, NODE_W } from "@/domain/architecture/layout";
import { buildAllScenarios, buildScenario, FLOW_MODES } from "@/domain/architecture/scenarios";
import { CONCEPTS, conceptGraph, conceptsForTopic } from "@/domain/architecture/library";
import { toMermaid } from "@/domain/architecture/export";

const SPEC = "Create an AWS architecture using Route 53, an Application Load Balancer, Target Group, two EC2 instances, Security Groups, and RDS.";

describe("parseRequest", () => {
  it("reads the spec example with counts (and does not read 'Route 53' as 53 of something)", () => {
    const p = parseRequest(SPEC);
    expect(p.provider).toBe("aws");
    expect(p.services).toEqual({ route53: 1, alb: 1, "target-group": 1, ec2: 2, "security-group": 1, rds: 1 });
  });
  it("prefers the longest alias and detects Azure", () => {
    const p = parseRequest("Azure Front Door, Application Gateway, VM scale set and Azure SQL");
    expect(p.provider).toBe("azure");
    expect(p.services).toEqual({ "front-door": 1, "application-gateway": 1, vmss: 1, "azure-sql": 1 });
  });
  it("reads digits and flags", () => {
    const p = parseRequest("3 ec2 instances behind an ALB, single AZ, mysql database");
    expect(p.services.ec2).toBe(3);
    expect(p.flags).toMatchObject({ singleAz: true, dbEngine: "mysql" });
  });
});

describe("generate (scenario A)", () => {
  const r = generate(parseRequest(SPEC));
  const g = r.graph;
  const kinds = (k: string) => g.nodes.filter((n) => n.kind === k);
  const rel = (s: string, t: string) => g.edges.filter((e) => e.source === s && e.target === t).map((e) => e.relation);

  it("produces a valid graph", () => {
    expect(validateGraph(g).filter((v) => v.level === "error")).toEqual([]);
  });
  it("Route 53 only resolves; users connect to the ALB directly", () => {
    expect(rel("users", "route53")).toEqual(["dns-resolves"]);
    expect(rel("route53", "alb")).toEqual(["resolves-to"]);
    expect(rel("users", "alb")).toEqual(["connects"]);
    expect(g.edges.some((e) => e.source === "route53" && ["connects", "routes-to", "forwards-to"].includes(e.relation))).toBe(false);
  });
  it("ALB → target group → EC2, with separate health checks", () => {
    expect(rel("alb", "tg")).toEqual(["forwards-to"]);
    expect(kinds("ec2")).toHaveLength(2);
    for (const e of kinds("ec2")) {
      expect(rel("tg", e.key)).toEqual(["registers"]);
      expect(rel("alb", e.key)).toEqual(["health-checks"]);
    }
  });
  it("security groups are attached, never hops", () => {
    for (const sg of kinds("security-group")) {
      expect(g.edges.filter((e) => e.source === sg.key || e.target === sg.key).every((e) => e.relation === "attached-to")).toBe(true);
    }
    expect(kinds("security-group").length).toBeGreaterThanOrEqual(3);
  });
  it("EC2s are spread across two AZs in private subnets; RDS Multi-AZ", () => {
    const azOf = (key: string) => {
      const byId = new Map(g.boundaries.map((b) => [b.id, b]));
      let b = byId.get(g.nodes.find((n) => n.key === key)!.boundaryId!);
      const kinds: string[] = [];
      while (b) {
        kinds.push(`${b.kind}:${b.id}`);
        b = b.parentId ? byId.get(b.parentId) : undefined;
      }
      return kinds;
    };
    expect(azOf("ec2-1")).toEqual(expect.arrayContaining(["subnet-private:app-a", "az:az-a"]));
    expect(azOf("ec2-2")).toEqual(expect.arrayContaining(["subnet-private:app-b", "az:az-b"]));
    expect(rel("rds-primary", "rds-standby")).toEqual(expect.arrayContaining(["replicates", "failover"]));
  });
  it("reports supporting components and assumptions", () => {
    expect(r.added.map((a) => a.kind)).toEqual(expect.arrayContaining(["acm", "internet-gateway"]));
    expect(r.assumptions.join(" ")).toMatch(/PostgreSQL/);
  });
  it("never lays two resources on top of each other or a box over a stranger's resource", () => {
    const rects = boundaryRects(g);
    const byId = new Map(g.boundaries.map((b) => [b.id, b]));
    const chain = (id?: string) => {
      const s = new Set<string>();
      for (let c = id; c; c = byId.get(c)?.parentId) s.add(c);
      return s;
    };
    for (const a of g.nodes)
      for (const b of g.nodes)
        if (a !== b) expect(a.x! < b.x! + NODE_W && a.x! + NODE_W > b.x! && a.y! < b.y! + NODE_H && a.y! + NODE_H > b.y!).toBe(false);
    for (const n of g.nodes) {
      for (const [id, rc] of rects) {
        if (chain(n.boundaryId).has(id)) continue;
        expect(n.x! < rc.x + rc.w && n.x! + NODE_W > rc.x && n.y! < rc.y + rc.h && n.y! + NODE_H > rc.y, `${n.key} inside ${id}`).toBe(false);
      }
    }
  });
  it("is deterministic", () => {
    expect(generate(parseRequest(SPEC))).toEqual(generate(parseRequest(SPEC)));
  });
});

describe("generate: supporting components", () => {
  it("adds a load balancer for several instances and a target group for a load balancer", () => {
    const r = generate({ provider: "aws", services: { ec2: 3 } });
    expect(r.added.map((a) => a.kind)).toEqual(expect.arrayContaining(["alb", "target-group", "security-group"]));
    expect(hasErrors(validateGraph(r.graph))).toBe(false);
  });
  it("uses a gateway endpoint for S3 from private subnets instead of leaving them stranded", () => {
    const r = generate({ provider: "aws", services: { alb: 1, ec2: 2, s3: 1 } });
    expect(r.graph.nodes.some((n) => n.kind === "vpc-endpoint")).toBe(true);
    expect(hasErrors(validateGraph(r.graph))).toBe(false);
  });
  it("asks when nothing runs the app", () => {
    expect(generate({ provider: "aws", services: { route53: 1 } }).questions.length).toBeGreaterThan(0);
  });
});

describe("scenarios (scenario B)", () => {
  const g = generate(parseRequest(SPEC)).graph;
  it("normal traffic follows DNS → ALB → listener → target group → EC2 → RDS → response", () => {
    const s = buildScenario(g, "normal");
    expect(s.applicable).toBe(true);
    expect(s.steps.map((x) => x.title)).toEqual([
      "Resolve the name", "Connect to Application Load Balancer", "Listener rule matches", "Pick a healthy target", "Query RDS PostgreSQL primary", "Response returns",
    ]);
    expect(s.steps[0]!.explanation).toMatch(/not part of the request path/);
    expect(s.steps.every((x) => x.explanation.length > 20 && x.nodeKeys.length > 0)).toBe(true);
  });
  it("every failure mode is applicable to the ALB web app and has the right outcome", () => {
    const all = buildAllScenarios(g);
    const by = Object.fromEntries(all.map((s) => [s.mode, s]));
    expect(by["health-check-failure"]!.steps.some((s) => s.outcome === "FAILOVER")).toBe(true);
    expect(by["sg-rejection"]!.steps.some((s) => s.outcome === "REJECTED")).toBe(true);
    expect(by["backend-failure"]!.steps.at(-1)!.explanation).toMatch(/502/);
    expect(by["multi-az-failover"]!.applicable).toBe(true);
    expect(by["routing-failure"]!.applicable).toBe(true);
    expect(by["dns-failover"]!.applicable).toBe(false);
    expect(by["dns-failover"]!.reason).toMatch(/secondary/);
  });
  it("references only nodes and edges that exist", () => {
    const keys = new Set(g.nodes.map((n) => n.key));
    const edges = new Set(g.edges.map((e) => e.key));
    for (const s of buildAllScenarios(g))
      for (const st of s.steps) {
        st.nodeKeys.forEach((k) => expect(keys.has(k)).toBe(true));
        st.edgeKeys.forEach((k) => expect(edges.has(k)).toBe(true));
      }
  });
});

describe("concept library", () => {
  it.each(CONCEPTS.map((c) => [c.id]))("%s is valid and animates", (id) => {
    const r = conceptGraph(id)!;
    expect(validateGraph(r.graph).filter((v) => v.level === "error")).toEqual([]);
    expect(buildScenario(r.graph, "normal").applicable).toBe(true);
  });
  it("Route 53 failover concept supports DNS failover", () => {
    const s = buildScenario(conceptGraph("route53-failover")!.graph, "dns-failover");
    expect(s.applicable).toBe(true);
    expect(s.steps.some((x) => x.outcome === "FAILOVER")).toBe(true);
  });
  it("maps topics to concepts", () => {
    expect(conceptsForTopic("Application Load Balancer").map((c) => c.id)).toContain("alb-web-app");
    expect(conceptsForTopic("azure front door").map((c) => c.id)).toContain("azure-web");
    expect(FLOW_MODES).toHaveLength(7);
  });
});

describe("mermaid export", () => {
  it("emits nested subgraphs and styled edges", () => {
    const m = toMermaid(generate(parseRequest(SPEC)).graph);
    expect(m.startsWith("flowchart LR")).toBe(true);
    expect(m).toMatch(/subgraph b_vpc/);
    expect(m).toMatch(/users -\.->.*route53/);
  });
});
