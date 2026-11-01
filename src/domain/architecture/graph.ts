/**
 * Architecture graph model and validation rules (contract for Architecture Studio, Phase 2).
 * Encodes the accuracy requirements from the spec, e.g. security groups attach to resources
 * rather than forwarding traffic, target groups are configuration, Route 53 only resolves DNS.
 */
export type Relation =
  | "dns-resolves" | "connects" | "routes-to" | "forwards-to" | "registers"
  | "attached-to" | "health-checks" | "replicates" | "failover";

export type BoundaryKind = "region" | "vpc" | "az" | "subnet-public" | "subnet-private";

export interface Boundary { id: string; kind: BoundaryKind; label: string; parentId?: string }
export interface ArchNode {
  key: string;
  kind: string;
  role: "traffic" | "config" | "boundary-member";
  label: string;
  boundaryId?: string;
  config?: Record<string, unknown>;
}
export interface ArchEdge { key: string; source: string; target: string; relation: Relation | string; protocol?: string; port?: number }
export interface ArchGraph { boundaries: Boundary[]; nodes: ArchNode[]; edges: ArchEdge[] }

export interface ValidationResult {
  level: "error" | "warning" | "assumption";
  rule: string;
  message: string;
  nodeKeys?: string[];
  edgeKeys?: string[];
}

const SECURITY_FILTERS = new Set(["security-group", "nsg", "nacl"]);
const LOAD_BALANCERS = new Set(["alb", "nlb", "gwlb"]);
const DNS = new Set(["route53", "azure-dns"]);
const TARGET_GROUPS = new Set(["target-group"]);
const COMPUTE = new Set(["ec2", "ecs-task", "ecs-service", "lambda", "eks-pod", "vm", "vm-scale-set", "ip-target"]);
const TRAFFIC_RELATIONS = new Set(["connects", "routes-to", "forwards-to"]);
const EGRESS = new Set(["nat-gateway", "vpc-endpoint", "internet-gateway", "azure-firewall", "nat"]);

export function validateGraph(g: ArchGraph): ValidationResult[] {
  const out: ValidationResult[] = [];
  const nodes = new Map(g.nodes.map((n) => [n.key, n]));
  const boundaries = new Map(g.boundaries.map((b) => [b.id, b]));

  // Structural integrity
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
      out.push({ level: "error", rule: "edge-endpoints", message: `Edge ${e.key} points at a missing node.`, edgeKeys: [e.key] });
      continue;
    }

    // Security groups / NSGs are attached, never a hop in the request path.
    if ((SECURITY_FILTERS.has(s.kind) || SECURITY_FILTERS.has(t.kind)) && e.relation !== "attached-to")
      out.push({ level: "error", rule: "security-group-attached", message: `${SECURITY_FILTERS.has(s.kind) ? s.label : t.label} is a firewall rule set attached to resources, not a traffic hop. Use an “attached-to” relation.`, edgeKeys: [e.key] });
    if (e.relation === "attached-to" && !SECURITY_FILTERS.has(s.kind))
      out.push({ level: "warning", rule: "attached-to-source", message: `Only security groups, NSGs or NACLs are normally drawn as “attached-to” (${s.label}).`, edgeKeys: [e.key] });

    // Route 53 resolves names; it does not proxy requests.
    if (DNS.has(s.kind) && TRAFFIC_RELATIONS.has(e.relation))
      out.push({ level: "error", rule: "dns-not-proxy", message: `${s.label} answers DNS queries; the client then connects to the endpoint directly. Draw client → ${s.label} as “dns-resolves” and client → load balancer as the request.`, edgeKeys: [e.key] });
    if (DNS.has(t.kind) && e.relation !== "dns-resolves")
      out.push({ level: "error", rule: "dns-not-proxy", message: `Traffic to ${t.label} should be a DNS resolution, not a ${e.relation} edge.`, edgeKeys: [e.key] });

    // Target groups: forwarded to by a load balancer, register compute targets.
    if (TARGET_GROUPS.has(t.kind) && e.relation !== "forwards-to")
      out.push({ level: "error", rule: "target-group-config", message: `${t.label} is routing configuration reached by a listener rule (“forwards-to”), not a network appliance.`, edgeKeys: [e.key] });
    if (TARGET_GROUPS.has(t.kind) && e.relation === "forwards-to" && !LOAD_BALANCERS.has(s.kind))
      out.push({ level: "error", rule: "target-group-config", message: `Only a load balancer listener can forward to ${t.label}.`, edgeKeys: [e.key] });
    if (TARGET_GROUPS.has(s.kind) && e.relation !== "registers")
      out.push({ level: "error", rule: "target-group-config", message: `${s.label} should “register” targets rather than ${e.relation} them.`, edgeKeys: [e.key] });
    if (TARGET_GROUPS.has(s.kind) && e.relation === "registers" && !COMPUTE.has(t.kind))
      out.push({ level: "warning", rule: "target-group-targets", message: `${t.label} is not a typical target type (instance, IP, Lambda).`, edgeKeys: [e.key] });

    // Health checks are the load balancer's own probes, distinct from user traffic.
    if (e.relation === "health-checks" && !(LOAD_BALANCERS.has(s.kind) || s.kind === "application-gateway" || s.kind === "azure-load-balancer" || DNS.has(s.kind)))
      out.push({ level: "warning", rule: "health-check-source", message: `Health checks normally originate from a load balancer or DNS failover policy, not ${s.label}.`, edgeKeys: [e.key] });
  }

  // Private subnets do not imply internet access.
  const inPrivate = (n: ArchNode) => {
    let b = n.boundaryId ? boundaries.get(n.boundaryId) : undefined;
    for (let i = 0; b && i < 10; i++) {
      if (b.kind === "subnet-private") return true;
      b = b.parentId ? boundaries.get(b.parentId) : undefined;
    }
    return false;
  };
  const hasEgress = g.nodes.some((n) => EGRESS.has(n.kind));
  for (const e of g.edges) {
    const s = nodes.get(e.source);
    const t = nodes.get(e.target);
    if (!s || !t || !TRAFFIC_RELATIONS.has(e.relation)) continue;
    if (inPrivate(s) && (t.kind === "internet" || t.kind === "external-api") && !hasEgress)
      out.push({ level: "error", rule: "private-egress", message: `${s.label} is in a private subnet and cannot reach ${t.label} without a NAT gateway or VPC endpoint.`, edgeKeys: [e.key] });
  }

  // Load balancers with a target group but no healthy-check edge: state the assumption explicitly.
  for (const n of g.nodes.filter((x) => LOAD_BALANCERS.has(x.kind))) {
    if (!g.edges.some((e) => e.source === n.key && e.relation === "health-checks"))
      out.push({ level: "assumption", rule: "health-check-default", message: `${n.label}: no health check drawn; assuming the target group's default (HTTP, path /).`, nodeKeys: [n.key] });
  }

  return out;
}

export const hasErrors = (results: ValidationResult[]) => results.some((r) => r.level === "error");
