import { describe, expect, it } from "vitest";
import { hasErrors, validateGraph, type ArchGraph } from "@/domain/architecture/graph";
import { sampleAwsGraph, sampleAzureGraph } from "@/domain/architecture/samples";

const rules = (g: ArchGraph, level = "error") => validateGraph(g).filter((r) => r.level === level).map((r) => r.rule);

describe("architecture validation", () => {
  it("accepts the sample AWS (Route 53 → ALB → target group → EC2) architecture", () => {
    expect(hasErrors(validateGraph(sampleAwsGraph()))).toBe(false);
  });

  it("accepts the sample Azure architecture", () => {
    expect(hasErrors(validateGraph(sampleAzureGraph()))).toBe(false);
  });

  it("rejects a security group drawn as a traffic hop", () => {
    const g = sampleAwsGraph();
    g.edges.push({ key: "bad", source: "alb", target: "sg-app", relation: "routes-to" });
    expect(rules(g)).toContain("security-group-attached");
  });

  it("rejects Route 53 proxying the request", () => {
    const g = sampleAwsGraph();
    g.edges.push({ key: "bad", source: "r53", target: "alb", relation: "routes-to", protocol: "HTTPS", port: 443 });
    expect(rules(g)).toContain("dns-not-proxy");
  });

  it("rejects a target group treated as a network appliance", () => {
    const g = sampleAwsGraph();
    g.edges.push({ key: "bad", source: "user", target: "tg", relation: "connects" });
    g.edges.push({ key: "bad2", source: "tg", target: "ec2a", relation: "routes-to" });
    expect(rules(g)).toEqual(expect.arrayContaining(["target-group-config"]));
    expect(rules(g).filter((r) => r === "target-group-config")).toHaveLength(2);
  });

  it("requires a load balancer to forward to a target group", () => {
    const g = sampleAwsGraph();
    g.edges.push({ key: "bad", source: "ec2a", target: "tg", relation: "forwards-to" });
    expect(rules(g)).toContain("target-group-config");
  });

  it("flags internet access from a private subnet without NAT or endpoint", () => {
    const g = sampleAwsGraph();
    g.nodes.push({ key: "net", kind: "internet", role: "traffic", label: "Internet", x: 0, y: 0 });
    g.edges.push({ key: "out", source: "ec2a", target: "net", relation: "connects", protocol: "HTTPS", port: 443 });
    expect(rules(g)).toContain("private-egress");
    g.nodes.push({ key: "nat", kind: "nat-gateway", role: "traffic", label: "NAT", boundaryId: "pub-a", x: 0, y: 0 });
    expect(rules(g)).not.toContain("private-egress");
  });

  it("states an explicit assumption when no health check is drawn", () => {
    const g = sampleAwsGraph();
    g.edges = g.edges.filter((e) => e.relation !== "health-checks");
    expect(rules(g, "assumption")).toContain("health-check-default");
  });

  it("catches broken references", () => {
    const g = sampleAwsGraph();
    g.edges.push({ key: "dangling", source: "alb", target: "nope", relation: "connects" });
    g.nodes.push({ key: "x", kind: "ec2", role: "traffic", label: "x", boundaryId: "missing", x: 0, y: 0 });
    expect(rules(g)).toEqual(expect.arrayContaining(["edge-endpoints", "boundary-exists"]));
  });
});
