import { COMPUTE_KINDS, DNS_KINDS, LOAD_BALANCER_KINDS, SECURITY_FILTER_KINDS } from "./catalog";
import type { Relation } from "./graph";

/** The relation a new connection most likely means, from what the two services are. */
export function defaultRelation(sourceKind: string, targetKind: string): Relation {
  if (SECURITY_FILTER_KINDS.has(sourceKind)) return "attached-to";
  if (DNS_KINDS.has(targetKind)) return "dns-resolves";
  if (DNS_KINDS.has(sourceKind)) return "resolves-to";
  if (sourceKind === "acm" || sourceKind === "waf") return "configures";
  if (sourceKind === "asg") return "manages";
  if (targetKind === "target-group") return "forwards-to";
  if (sourceKind === "target-group") return "registers";
  if (sourceKind === "api-gateway" && targetKind === "lambda") return "invokes";
  if (["nat-gateway", "internet-gateway", "vpc-endpoint", "private-endpoint"].includes(targetKind) && COMPUTE_KINDS.has(sourceKind)) return "routes-to";
  if (["nat-gateway", "internet-gateway", "vpc-endpoint", "private-endpoint"].includes(sourceKind)) return "routes-to";
  if (LOAD_BALANCER_KINDS.has(sourceKind) && COMPUTE_KINDS.has(targetKind) && sourceKind !== "alb" && sourceKind !== "nlb") return "routes-to";
  if (sourceKind === targetKind && ["rds", "azure-sql"].includes(sourceKind)) return "replicates";
  if (["secrets-manager", "cloudwatch", "ecr"].includes(targetKind)) return "uses";
  return "connects";
}

export const RELATION_INFO: Record<string, { label: string; color: string; dash?: string; arrow: boolean; width: number }> = {
  connects: { label: "request", color: "#64748b", arrow: true, width: 2 },
  "routes-to": { label: "routes to", color: "#64748b", arrow: true, width: 2 },
  "forwards-to": { label: "forwards to", color: "#7c3aed", arrow: true, width: 2 },
  registers: { label: "registered target", color: "#7c3aed", arrow: true, width: 1.5 },
  invokes: { label: "invokes", color: "#db2777", arrow: true, width: 2 },
  "dns-resolves": { label: "DNS lookup", color: "#2563eb", dash: "6 4", arrow: true, width: 1.5 },
  "resolves-to": { label: "DNS answer", color: "#2563eb", dash: "6 4", arrow: true, width: 1.5 },
  "attached-to": { label: "attached", color: "#94a3b8", dash: "2 4", arrow: false, width: 1.5 },
  configures: { label: "configures", color: "#94a3b8", dash: "2 4", arrow: false, width: 1.5 },
  manages: { label: "manages", color: "#94a3b8", dash: "2 4", arrow: false, width: 1.5 },
  "health-checks": { label: "health check", color: "#16a34a", dash: "3 3", arrow: true, width: 1.5 },
  replicates: { label: "replicates", color: "#9333ea", dash: "8 4", arrow: true, width: 2 },
  failover: { label: "failover", color: "#ea580c", dash: "8 4", arrow: true, width: 2 },
  uses: { label: "uses", color: "#94a3b8", dash: "4 4", arrow: true, width: 1.5 },
};
