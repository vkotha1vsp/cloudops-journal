/**
 * Typed architecture graph and validation rules.
 * The rules encode how AWS/Azure actually behave, e.g. security groups attach to resources rather than
 * forwarding traffic, target groups are configuration, Route 53 resolves names but never proxies requests.
 */
import { COMPUTE_KINDS, DATA_KINDS, DNS_KINDS, LOAD_BALANCER_KINDS, SECURITY_FILTER_KINDS } from "./catalog";

export type Relation =
  | "dns-resolves" // client asks a DNS service
  | "resolves-to" // the DNS answer points at an endpoint (alias record)
  | "connects" // a request / connection
  | "routes-to" // network routing hop (NAT, gateway, endpoint)
  | "forwards-to" // listener rule → target group
  | "registers" // target group → registered target
  | "invokes" // API Gateway → Lambda
  | "attached-to" // SG / NSG → resource
  | "configures" // certificate / WAF → listener or distribution
  | "manages" // Auto Scaling group → instances
  | "health-checks" // load balancer or DNS probe
  | "replicates" // primary → standby / replica
  | "failover" // primary → secondary path
  | "uses"; // reads configuration or secrets

export const RELATIONS: Relation[] = [
  "connects", "routes-to", "forwards-to", "registers", "invokes", "dns-resolves", "resolves-to",
  "attached-to", "configures", "manages", "health-checks", "replicates", "failover", "uses",
];

export type BoundaryKind = "region" | "vpc" | "az" | "subnet-public" | "subnet-private";

export interface Boundary {
  id: string;
  kind: BoundaryKind;
  label: string;
  parentId?: string;
}
export interface ArchNode {
  key: string;
  kind: string;
  role: "traffic" | "config" | "boundary-member";
  label: string;
  boundaryId?: string;
  config?: Record<string, unknown>;
  x?: number;
  y?: number;
}
export interface ArchEdge {
  key: string;
  source: string;
  target: string;
  relation: Relation | string;
  protocol?: string;
  port?: number;
  label?: string;
}
export interface ArchGraph {
  boundaries: Boundary[];
  nodes: ArchNode[];
  edges: ArchEdge[];
}

export interface ValidationResult {
  level: "error" | "warning" | "assumption";
  rule: string;
  message: string;
  nodeKeys?: string[];
  edgeKeys?: string[];
}

export const TRAFFIC_RELATIONS = new Set(["connects", "routes-to", "forwards-to", "invokes"]);
const TARGET_GROUPS = new Set(["target-group"]);
const HEALTH_CHECK_SOURCES = new Set([...LOAD_BALANCER_KINDS, ...DNS_KINDS]);
const EXTERNAL = new Set(["internet"]);

export function validateGraph(g: ArchGraph): ValidationResult[] {
  const out: ValidationResult[] = [];
  const nodes = new Map(g.nodes.map((n) => [n.key, n]));
  const boundaries = new Map(g.boundaries.map((b) => [b.id, b]));

  // ── Structure
  const seen = new Set<string>();
  for (const n of g.nodes) {
    if (seen.has(n.key)) out.push({ level: "error", rule: "unique-node-keys", message: `Duplicate node key “${n.key}”.`, nodeKeys: [n.key] });
    seen.add(n.key);
    if (n.boundaryId && !boundaries.has(n.boundaryId))
      out.push({ level: "error", rule: "boundary-exists", message: `${n.label} references unknown boundary “${n.boundaryId}”.`, nodeKeys: [n.key] });
  }
  for (const b of g.boundaries) {
    if (b.parentId && !boundaries.has(b.parentId))
      out.push({ level: "error", rule: "boundary-exists", message: `Boundary ${b.label} has unknown parent “${b.parentId}”.` });
    const parent = b.parentId ? boundaries.get(b.parentId) : undefined;
    if ((b.kind === "subnet-public" || b.kind === "subnet-private") && parent && parent.kind !== "az" && parent.kind !== "vpc")
      out.push({ level: "error", rule: "subnet-in-vpc", message: `Subnet ${b.label} must sit inside an Availability Zone or VPC.` });
  }

  for (const e of g.edges) {
    const s = nodes.get(e.source);
    const t = nodes.get(e.target);
    if (!s || !t) {
      out.push({ level: "error", rule: "edge-endpoints", message: `Connection ${e.key} points at a missing resource.`, edgeKeys: [e.key] });
      continue;
    }

    // Security groups / NSGs / NACLs are attached, never a hop.
    if ((SECURITY_FILTER_KINDS.has(s.kind) || SECURITY_FILTER_KINDS.has(t.kind)) && e.relation !== "attached-to")
      out.push({
        level: "error", rule: "security-group-attached", edgeKeys: [e.key],
        message: `${SECURITY_FILTER_KINDS.has(s.kind) ? s.label : t.label} is a set of firewall rules attached to resources, not a traffic hop. Use “attached-to”.`,
      });
    if (e.relation === "attached-to" && !SECURITY_FILTER_KINDS.has(s.kind))
      out.push({ level: "warning", rule: "attached-to-source", message: `Only security groups, NSGs or NACLs are drawn as “attached-to” (${s.label}).`, edgeKeys: [e.key] });

    // DNS resolves names; it never proxies requests.
    if (DNS_KINDS.has(s.kind) && TRAFFIC_RELATIONS.has(e.relation))
      out.push({
        level: "error", rule: "dns-not-proxy", edgeKeys: [e.key],
        message: `${s.label} answers DNS queries; the client then connects to the endpoint directly. Draw ${s.label} → endpoint as “resolves-to” and the client → endpoint as the request.`,
      });
    if (DNS_KINDS.has(t.kind) && e.relation !== "dns-resolves")
      out.push({ level: "error", rule: "dns-not-proxy", message: `A connection into ${t.label} should be a DNS lookup (“dns-resolves”), not “${e.relation}”.`, edgeKeys: [e.key] });
    if (e.relation === "resolves-to" && !DNS_KINDS.has(s.kind))
      out.push({ level: "warning", rule: "resolves-to-source", message: `Only a DNS service resolves names (${s.label}).`, edgeKeys: [e.key] });

    // Target groups: reached by a listener rule, register targets.
    if (TARGET_GROUPS.has(t.kind) && e.relation !== "forwards-to")
      out.push({ level: "error", rule: "target-group-config", message: `${t.label} is routing configuration reached by a listener rule (“forwards-to”), not a network appliance.`, edgeKeys: [e.key] });
    if (TARGET_GROUPS.has(t.kind) && e.relation === "forwards-to" && !LOAD_BALANCER_KINDS.has(s.kind))
      out.push({ level: "error", rule: "target-group-config", message: `Only a load balancer listener can forward to ${t.label}.`, edgeKeys: [e.key] });
    if (TARGET_GROUPS.has(s.kind) && e.relation !== "registers")
      out.push({ level: "error", rule: "target-group-config", message: `${s.label} should “register” targets rather than “${e.relation}” them.`, edgeKeys: [e.key] });
    if (TARGET_GROUPS.has(s.kind) && e.relation === "registers" && !COMPUTE_KINDS.has(t.kind))
      out.push({ level: "warning", rule: "target-group-targets", message: `${t.label} is not a usual target type (instance, IP or Lambda).`, edgeKeys: [e.key] });

    // Health checks are the load balancer's / DNS's own probes.
    if (e.relation === "health-checks" && !HEALTH_CHECK_SOURCES.has(s.kind))
      out.push({ level: "warning", rule: "health-check-source", message: `Health checks normally come from a load balancer or a DNS failover policy, not ${s.label}.`, edgeKeys: [e.key] });
  }

  // ── Network reachability
  const ancestors = (n: ArchNode) => {
    const kinds: BoundaryKind[] = [];
    let b = n.boundaryId ? boundaries.get(n.boundaryId) : undefined;
    for (let i = 0; b && i < 10; i++) {
      kinds.push(b.kind);
      b = b.parentId ? boundaries.get(b.parentId) : undefined;
    }
    return kinds;
  };
  const inPrivate = (n: ArchNode) => ancestors(n).includes("subnet-private");
  const inPublic = (n: ArchNode) => ancestors(n).includes("subnet-public");
  const hasKind = (k: string) => g.nodes.some((n) => n.kind === k);

  for (const e of g.edges) {
    const s = nodes.get(e.source);
    const t = nodes.get(e.target);
    if (!s || !t || !TRAFFIC_RELATIONS.has(e.relation)) continue;
    if (inPrivate(s) && EXTERNAL.has(t.kind) && !hasKind("nat-gateway"))
      out.push({ level: "error", rule: "private-egress", message: `${s.label} is in a private subnet and cannot reach ${t.label} without a NAT gateway.`, edgeKeys: [e.key] });
    if (inPrivate(s) && (t.kind === "s3" || t.kind === "dynamodb") && !hasKind("nat-gateway") && !hasKind("vpc-endpoint"))
      out.push({ level: "error", rule: "private-egress", message: `${s.label} is in a private subnet: reaching ${t.label} needs a VPC endpoint or a NAT gateway.`, edgeKeys: [e.key] });
    if ((s.kind === "client" || s.kind === "internet") && inPrivate(t))
      out.push({ level: "error", rule: "private-ingress", message: `${t.label} is in a private subnet, so the internet cannot reach it directly. Put a load balancer in front.`, edgeKeys: [e.key] });
  }
  for (const n of g.nodes) {
    if (DATA_KINDS.has(n.kind) && inPublic(n))
      out.push({ level: "warning", rule: "db-public", message: `${n.label} sits in a public subnet. Databases normally live in private subnets.`, nodeKeys: [n.key] });
  }

  // ── Completeness hints
  for (const n of g.nodes.filter((x) => x.kind === "alb" || x.kind === "nlb")) {
    if (!g.edges.some((e) => e.source === n.key && e.relation === "forwards-to"))
      out.push({ level: "warning", rule: "lb-no-target", message: `${n.label} has no listener rule forwarding to a target group.`, nodeKeys: [n.key] });
    if (!g.edges.some((e) => e.source === n.key && e.relation === "health-checks"))
      out.push({ level: "assumption", rule: "health-check-default", message: `${n.label}: no health check drawn; assuming the target group's default (HTTP, path /).`, nodeKeys: [n.key] });
  }

  return out;
}

export const hasErrors = (results: ValidationResult[]) => results.some((r) => r.level === "error");

export function emptyGraph(): ArchGraph {
  return { boundaries: [], nodes: [], edges: [] };
}
