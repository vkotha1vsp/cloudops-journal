import type { ArchGraph } from "./graph";

/** Sample graphs used by the seed script and the architecture validation tests. */
export type SampleGraph = {
  boundaries: ArchGraph["boundaries"];
  nodes: (ArchGraph["nodes"][number] & { x: number; y: number })[];
  edges: (ArchGraph["edges"][number] & { label?: string })[];
};

export function sampleAwsGraph(): SampleGraph {
  return {
    boundaries: [
      { id: "region", kind: "region", label: "us-east-1" },
      { id: "vpc", kind: "vpc", label: "VPC 10.0.0.0/16", parentId: "region" },
      { id: "az-a", kind: "az", label: "us-east-1a", parentId: "vpc" },
      { id: "az-b", kind: "az", label: "us-east-1b", parentId: "vpc" },
      { id: "pub-a", kind: "subnet-public", label: "public 10.0.0.0/24", parentId: "az-a" },
      { id: "pub-b", kind: "subnet-public", label: "public 10.0.1.0/24", parentId: "az-b" },
      { id: "priv-a", kind: "subnet-private", label: "private 10.0.10.0/24", parentId: "az-a" },
      { id: "priv-b", kind: "subnet-private", label: "private 10.0.11.0/24", parentId: "az-b" },
    ],
    nodes: [
      { key: "user", kind: "client", role: "traffic", label: "Browser", x: 0, y: 200 },
      { key: "r53", kind: "route53", role: "traffic", label: "Route 53 (learn.example.com)", x: 0, y: 40 },
      { key: "alb", kind: "alb", role: "traffic", label: "ALB · HTTPS:443", boundaryId: "vpc", config: { scheme: "internet-facing", subnets: ["pub-a", "pub-b"] }, x: 260, y: 200 },
      { key: "tg", kind: "target-group", role: "config", label: "Target group · HTTP:3000", boundaryId: "vpc", config: { healthCheck: { path: "/api/health", matcher: "200" } }, x: 470, y: 200 },
      { key: "ec2a", kind: "ec2", role: "traffic", label: "EC2 app-a", boundaryId: "priv-a", x: 700, y: 120 },
      { key: "ec2b", kind: "ec2", role: "traffic", label: "EC2 app-b", boundaryId: "priv-b", x: 700, y: 290 },
      { key: "sg-alb", kind: "security-group", role: "config", label: "sg-alb: 443 from 0.0.0.0/0", boundaryId: "vpc", x: 260, y: 330 },
      { key: "sg-app", kind: "security-group", role: "config", label: "sg-app: 3000 from sg-alb", boundaryId: "vpc", x: 900, y: 200 },
    ],
    edges: [
      { key: "e-dns", source: "user", target: "r53", relation: "dns-resolves", protocol: "DNS", port: 53 },
      { key: "e-https", source: "user", target: "alb", relation: "connects", protocol: "HTTPS", port: 443 },
      { key: "e-fwd", source: "alb", target: "tg", relation: "forwards-to", label: "listener rule: default" },
      { key: "e-reg-a", source: "tg", target: "ec2a", relation: "registers", protocol: "HTTP", port: 3000 },
      { key: "e-reg-b", source: "tg", target: "ec2b", relation: "registers", protocol: "HTTP", port: 3000 },
      { key: "e-hc-a", source: "alb", target: "ec2a", relation: "health-checks", protocol: "HTTP", port: 3000, label: "GET /api/health" },
      { key: "e-hc-b", source: "alb", target: "ec2b", relation: "health-checks", protocol: "HTTP", port: 3000, label: "GET /api/health" },
      { key: "e-sg-alb", source: "sg-alb", target: "alb", relation: "attached-to" },
      { key: "e-sg-a", source: "sg-app", target: "ec2a", relation: "attached-to" },
      { key: "e-sg-b", source: "sg-app", target: "ec2b", relation: "attached-to" },
    ],
  };
}

export function sampleAzureGraph(): SampleGraph {
  return {
    boundaries: [
      { id: "rg", kind: "region", label: "East US · rg-web" },
      { id: "vnet", kind: "vpc", label: "VNet 10.1.0.0/16", parentId: "rg" },
      { id: "snet-agw", kind: "subnet-public", label: "snet-appgw 10.1.0.0/24", parentId: "vnet" },
      { id: "snet-app", kind: "subnet-private", label: "snet-app 10.1.1.0/24", parentId: "vnet" },
    ],
    nodes: [
      { key: "user", kind: "client", role: "traffic", label: "Browser", x: 0, y: 160 },
      { key: "afd", kind: "front-door", role: "traffic", label: "Azure Front Door", x: 200, y: 160 },
      { key: "agw", kind: "application-gateway", role: "traffic", label: "Application Gateway (WAF v2)", boundaryId: "snet-agw", x: 420, y: 160 },
      { key: "vmss", kind: "vm-scale-set", role: "traffic", label: "VM scale set :8080", boundaryId: "snet-app", x: 660, y: 160 },
      { key: "nsg", kind: "nsg", role: "config", label: "NSG: 8080 from snet-appgw", boundaryId: "snet-app", x: 660, y: 300 },
    ],
    edges: [
      { key: "e1", source: "user", target: "afd", relation: "connects", protocol: "HTTPS", port: 443 },
      { key: "e2", source: "afd", target: "agw", relation: "routes-to", protocol: "HTTPS", port: 443 },
      { key: "e3", source: "agw", target: "vmss", relation: "routes-to", protocol: "HTTP", port: 8080, label: "backend pool" },
      { key: "e4", source: "agw", target: "vmss", relation: "health-checks", protocol: "HTTP", port: 8080, label: "health probe" },
      { key: "e5", source: "nsg", target: "vmss", relation: "attached-to", label: "subnet association" },
    ],
  };
}
