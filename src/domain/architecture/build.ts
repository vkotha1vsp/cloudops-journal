/**
 * Rule-based architecture generator (Architecture Studio, modes A and B).
 * Never connects services in the order they were listed: each service is placed and wired by what it IS
 * (a DNS service resolves, a load balancer forwards through a target group, an SG attaches, …), supporting
 * components it needs are added and reported, and every guess is returned as a labelled assumption.
 */
import { service } from "./catalog";
import type { ArchEdge, ArchGraph, ArchNode, Boundary, BoundaryKind, Relation } from "./graph";
import { autoLayout } from "./layout";
import type { ParsedRequest } from "./parse";

export type GenerateInput = {
  provider: "aws" | "azure";
  services: Record<string, number>;
  flags?: ParsedRequest["flags"];
};

export type GenerateResult = {
  graph: ArchGraph;
  assumptions: string[];
  questions: string[];
  added: { kind: string; reason: string }[];
  ignored: string[];
};

export class Builder {
  boundaries: Boundary[] = [];
  nodes: ArchNode[] = [];
  edges: ArchEdge[] = [];
  private n = 0;
  boundary(id: string, kind: BoundaryKind, label: string, parentId?: string) {
    if (!this.boundaries.some((b) => b.id === id)) this.boundaries.push({ id, kind, label, parentId });
    return id;
  }
  node(key: string, kind: string, label: string, boundaryId?: string, config?: Record<string, unknown>) {
    this.nodes.push({ key, kind, role: service(kind).role, label, boundaryId, config: config ?? {} });
    return key;
  }
  edge(source: string, target: string, relation: Relation, opts: { protocol?: string; port?: number; label?: string } = {}) {
    this.edges.push({ key: `e${++this.n}`, source, target, relation, ...opts });
  }
  /** Drop boundaries with no nodes in them or below them. */
  prune() {
    const used = new Set<string>();
    const parent = new Map(this.boundaries.map((b) => [b.id, b.parentId]));
    for (const n of this.nodes) {
      let cur = n.boundaryId;
      while (cur && !used.has(cur)) {
        used.add(cur);
        cur = parent.get(cur);
      }
    }
    this.boundaries = this.boundaries.filter((b) => used.has(b.id));
  }
  graph(): ArchGraph {
    this.prune();
    return autoLayout({ boundaries: this.boundaries, nodes: this.nodes, edges: this.edges });
  }
}

export function generate(input: GenerateInput): GenerateResult {
  return input.provider === "azure" ? generateAzure(input) : generateAws(input);
}

function count(input: GenerateInput, kind: string) {
  return input.services[kind] ?? 0;
}

// ─────────────────────────────── AWS ───────────────────────────────

function generateAws(input: GenerateInput): GenerateResult {
  const flags = input.flags ?? {};
  const want = (k: string) => count(input, k) > 0;
  const assumptions: string[] = [];
  const questions: string[] = [];
  const added: GenerateResult["added"] = [];
  const add = (kind: string, reason: string) => added.push({ kind, reason });
  const b = new Builder();
  const known = new Set([
    "route53", "cloudfront", "acm", "waf", "api-gateway", "internet-gateway", "nat-gateway", "vpc-endpoint", "security-group",
    "nacl", "alb", "nlb", "target-group", "ec2", "asg", "ecs", "eks", "lambda", "rds", "dynamodb", "s3", "efs", "cloudwatch",
    "secrets-manager", "cognito", "internet", "codebuild", "ecr", "github", "ssm",
  ]);
  const ignored = Object.keys(input.services).filter((k) => !known.has(k));

  // ── What compute runs the app
  const computeKind = want("ecs") ? "ecs" : want("eks") ? "eks" : want("ec2") || want("asg") ? "ec2" : null;
  let computeCount = computeKind ? Math.max(count(input, computeKind), 1) : 0;
  let lbKind: "alb" | "nlb" | null = want("alb") ? "alb" : want("nlb") ? "nlb" : null;
  if (!lbKind && want("target-group")) {
    lbKind = "alb";
    add("alb", "A target group only does something when a load balancer listener forwards to it.");
  }
  if (!lbKind && computeKind && computeCount > 1) {
    lbKind = "alb";
    add("alb", `Spreads requests across the ${computeCount} ${service(computeKind).label}s and stops sending to unhealthy ones.`);
  }
  if (lbKind && !computeKind && !want("lambda")) {
    questions.push("What should the load balancer send traffic to: EC2 instances, ECS tasks or Lambda? Assumed two EC2 instances.");
  }
  const effectiveCompute = computeKind ?? (lbKind && !want("lambda") ? "ec2" : null);
  if (effectiveCompute && !computeKind) computeCount = 2;
  if (lbKind && computeCount === 1) assumptions.push("Only one target behind the load balancer: there is no redundancy if it fails. Two or more across AZs is the norm.");

  const multiAz = !flags.singleAz && (Boolean(lbKind) || want("rds") || computeCount > 1);
  const azs = multiAz ? ["a", "b"] : ["a"];
  const needsVpc = Boolean(effectiveCompute || lbKind || want("rds") || want("nat-gateway") || want("efs") || want("vpc-endpoint"));

  // ── Boundaries
  b.node("users", "client", "Users");
  const region = b.boundary("region", "region", "Region us-east-1");
  let vpc: string | undefined;
  if (needsVpc) {
    vpc = b.boundary("vpc", "vpc", "VPC 10.0.0.0/16", region);
    for (const a of azs) {
      b.boundary(`az-${a}`, "az", `us-east-1${a}`, vpc);
      b.boundary(`public-${a}`, "subnet-public", `Public subnet ${a === "a" ? "10.0.0.0/24" : "10.0.1.0/24"}`, `az-${a}`);
      b.boundary(`app-${a}`, "subnet-private", `Private app subnet ${a === "a" ? "10.0.10.0/24" : "10.0.11.0/24"}`, `az-${a}`);
      b.boundary(`data-${a}`, "subnet-private", `Private data subnet ${a === "a" ? "10.0.20.0/24" : "10.0.21.0/24"}`, `az-${a}`);
    }
    assumptions.push(`Region us-east-1, one VPC (10.0.0.0/16) across ${azs.length === 2 ? "two Availability Zones" : "one Availability Zone"}.`);
  }

  // ── Edge: TLS certificate
  const https = Boolean(flags.https || want("acm") || want("route53") || want("cloudfront") || lbKind === "alb");
  let acm: string | undefined;
  if ((lbKind === "alb" || want("cloudfront")) && https) {
    acm = b.node("acm", "acm", "ACM certificate", region);
    if (!want("acm")) add("acm", "HTTPS listeners need a TLS certificate; ACM issues and renews it for free.");
  }

  // ── Load balancer and target group
  let lb: string | undefined;
  let tg: string | undefined;
  const appPort = effectiveCompute === "ec2" ? 80 : 8080;
  if (lbKind && vpc) {
    lb = b.node(lbKind, lbKind, lbKind === "alb" ? "Application Load Balancer" : "Network Load Balancer", vpc, {
      scheme: "internet-facing",
      subnets: azs.map((a) => `public-${a}`),
    });
    tg = b.node("tg", "target-group", `Target group ${lbKind === "alb" ? "HTTP" : "TCP"}:${appPort}`, vpc, {
      targetType: effectiveCompute === "ec2" ? "instance" : "ip",
      healthCheck: { path: "/health", matcher: "200" },
    });
    if (!want("target-group")) add("target-group", "The listener's rule forwards to a target group, which lists the targets and their health check.");
    b.edge(lb, tg, "forwards-to", { label: https && lbKind === "alb" ? "HTTPS:443 listener rule" : "listener rule" });
    if (acm) b.edge(acm, lb, "configures", { label: "listener certificate" });
    assumptions.push(`The load balancer is internet-facing in the public subnets of ${azs.length} AZ${azs.length > 1 ? "s" : ""}; targets listen on port ${appPort}.`);
  }

  // ── Internet gateway (public subnets, internet-facing LB, NAT)
  const publicCompute = Boolean(effectiveCompute && !lb);
  let igw: string | undefined;
  if (vpc && (lb || publicCompute || want("nat-gateway") || want("internet-gateway"))) {
    igw = b.node("igw", "internet-gateway", "Internet gateway", vpc);
    if (!want("internet-gateway")) add("internet-gateway", "Public subnets only reach the internet through an internet gateway on their route table.");
  }

  // ── Compute
  const targets: string[] = [];
  if (effectiveCompute && vpc) {
    const label = service(effectiveCompute).label;
    for (let i = 0; i < computeCount; i++) {
      const a = azs[i % azs.length]!;
      const subnet = publicCompute ? `public-${a}` : `app-${a}`;
      targets.push(b.node(`${effectiveCompute}-${i + 1}`, effectiveCompute, `${label} ${i + 1} (${a.toUpperCase()})`, subnet, { port: appPort }));
    }
    if (publicCompute) assumptions.push(`No load balancer: ${label} runs in a public subnet with a public IP so users can reach it.`);
    else assumptions.push(`${label}s run in private subnets; only the load balancer can reach them.`);
  }
  if (tg) {
    for (const t of targets) b.edge(tg, t, "registers", { protocol: "HTTP", port: appPort });
    if (lb) for (const t of targets) b.edge(lb, t, "health-checks", { protocol: "HTTP", port: appPort, label: "GET /health" });
  }
  if (want("asg") && vpc && effectiveCompute === "ec2") {
    const asg = b.node("asg", "asg", "Auto Scaling group", vpc, { min: computeCount, max: computeCount * 2 });
    for (const t of targets) b.edge(asg, t, "manages");
  }

  // ── Security groups (always, one per tier: accuracy, not decoration)
  if (vpc) {
    if (lb) {
      const sg = b.node("sg-lb", "security-group", "SG load balancer: 443 from internet", vpc);
      b.edge(sg, lb, "attached-to");
    }
    if (targets.length) {
      const sg = b.node("sg-app", "security-group", lb ? `SG app: ${appPort} from SG load balancer` : `SG app: ${appPort} from internet`, vpc);
      for (const t of targets) b.edge(sg, t, "attached-to");
    }
    if (!want("security-group")) add("security-group", "Every load balancer, instance and database needs a security group; one per tier keeps rules tight.");
    else assumptions.push("Security groups are attached to the resources they protect; they are not hops in the request path.");
  }

  // ── Entry: CloudFront / API Gateway / LB / public instance
  let entry: string | undefined;
  if (want("cloudfront")) {
    entry = b.node("cloudfront", "cloudfront", "CloudFront distribution");
    b.edge("users", entry, "connects", { protocol: "HTTPS", port: 443 });
    if (acm) b.edge(acm, entry, "configures", { label: "certificate (us-east-1)" });
    if (lb) b.edge(entry, lb, "connects", { protocol: "HTTPS", port: 443, label: "origin" });
  }
  let apigw: string | undefined;
  if (want("api-gateway") || (want("lambda") && !lb && !entry)) {
    apigw = b.node("apigw", "api-gateway", "API Gateway (HTTP API)", region);
    if (!want("api-gateway")) add("api-gateway", "Gives the Lambda function an HTTPS endpoint users can call.");
    if (!entry) entry = apigw;
    else b.edge(entry, apigw, "connects", { protocol: "HTTPS", port: 443, label: "/api origin" });
    if (entry === apigw) b.edge("users", apigw, "connects", { protocol: "HTTPS", port: 443 });
  }
  if (!entry && lb) {
    entry = lb;
    b.edge("users", lb, "connects", https ? { protocol: "HTTPS", port: 443 } : { protocol: "HTTP", port: 80 });
  }
  if (!entry && publicCompute && targets[0]) {
    entry = targets[0];
    b.edge("users", targets[0], "connects", { protocol: "HTTP", port: appPort });
  }
  if (lb && entry !== lb && !want("cloudfront")) b.edge("users", lb, "connects", { protocol: "HTTPS", port: 443 });

  // ── Lambda
  let fn: string | undefined;
  if (want("lambda") || apigw) {
    fn = b.node("lambda", "lambda", "Lambda function", region);
    if (!want("lambda")) add("lambda", "API Gateway needs an integration; a Lambda function handles the requests.");
    if (apigw) b.edge(apigw, fn, "invokes", { label: "integration" });
    else if (tg) b.edge(tg, fn, "registers", { label: "Lambda target" });
  }

  // ── DNS
  if (want("route53")) {
    b.node("route53", "route53", "Route 53 hosted zone");
    b.edge("users", "route53", "dns-resolves", { protocol: "DNS", port: 53, label: "app.example.com?" });
    if (entry) b.edge("route53", entry, "resolves-to", { label: "alias record" });
    assumptions.push("Route 53 only answers the DNS lookup (alias record); requests then go straight to the endpoint.");
  }

  // ── Data
  const appNodes = targets.length ? targets : fn ? [fn] : [];
  if (want("rds")) {
    if (!vpc) {
      questions.push("RDS needs a VPC. Which compute connects to it? Assumed the database sits in a VPC on its own.");
    }
    const engine = flags.dbEngine ?? "postgres";
    const port = engine === "mysql" ? 3306 : 5432;
    const primary = b.node("rds-primary", "rds", `RDS ${engine === "mysql" ? "MySQL" : "PostgreSQL"} primary`, vpc ? "data-a" : region);
    if (multiAz && vpc) {
      const standby = b.node("rds-standby", "rds", "RDS standby (Multi-AZ)", "data-b");
      b.edge(primary, standby, "replicates", { label: "synchronous" });
      b.edge(primary, standby, "failover", { label: "promoted on failure" });
    }
    const sg = vpc ? b.node("sg-db", "security-group", `SG database: ${port} from SG app`, vpc) : undefined;
    if (sg) b.edge(sg, primary, "attached-to");
    for (const t of appNodes) b.edge(t, primary, "connects", { protocol: engine === "mysql" ? "MySQL" : "PostgreSQL", port });
    if (!flags.dbEngine) assumptions.push("Database engine assumed PostgreSQL on port 5432.");
    if (multiAz) assumptions.push("RDS Multi-AZ: a synchronous standby in the second AZ takes over automatically.");
  }
  if (want("dynamodb")) {
    const t = b.node("dynamodb", "dynamodb", "DynamoDB table", region);
    for (const a of appNodes) b.edge(a, t, "connects", { protocol: "HTTPS", port: 443 });
  }
  if (want("s3")) {
    const bucket = b.node("s3", "s3", want("cloudfront") && !lb ? "S3 bucket (static site)" : "S3 bucket", region);
    if (want("cloudfront") && !lb) b.edge("cloudfront", bucket, "connects", { protocol: "HTTPS", port: 443, label: "origin (OAC)" });
    const privateApps = targets.filter(() => !publicCompute);
    if (privateApps.length && vpc && !want("nat-gateway")) {
      const vpce = b.node("vpce-s3", "vpc-endpoint", "S3 gateway endpoint", vpc);
      add("vpc-endpoint", "Private subnets have no internet route; a free gateway endpoint lets them reach S3 privately.");
      for (const t of privateApps) b.edge(t, vpce, "routes-to", { protocol: "HTTPS", port: 443 });
      b.edge(vpce, bucket, "routes-to");
    } else {
      for (const a of appNodes) b.edge(a, bucket, "connects", { protocol: "HTTPS", port: 443 });
    }
  }
  if (want("efs") && vpc) {
    const efs = b.node("efs", "efs", "EFS file system", "data-a");
    for (const t of targets) b.edge(t, efs, "connects", { protocol: "NFS", port: 2049 });
  }

  // ── Outbound internet via NAT
  if (want("nat-gateway") && vpc && igw) {
    const nat = b.node("nat", "nat-gateway", "NAT gateway", "public-a");
    for (const t of targets.filter(() => !publicCompute)) b.edge(t, nat, "routes-to", { label: "0.0.0.0/0" });
    b.edge(nat, igw, "routes-to");
    if (want("internet")) {
      const net = b.node("internet", "internet", "External API");
      b.edge(igw, net, "routes-to", { protocol: "HTTPS", port: 443 });
    }
    if (want("s3") && !b.nodes.some((n) => n.kind === "vpc-endpoint")) assumptions.push("S3 traffic leaves through the NAT gateway (billed per GB); a gateway endpoint would be free.");
  } else if (want("internet") && targets.length) {
    const net = b.node("internet", "internet", "External API");
    for (const t of targets) b.edge(t, net, "connects", { protocol: "HTTPS", port: 443 });
    if (!publicCompute) questions.push("Private instances call the internet: add a NAT gateway? Without one, the validator flags it.");
  }
  if (targets.length && !publicCompute && !want("nat-gateway") && vpc)
    assumptions.push("Private subnets have no outbound internet. Add a NAT gateway if instances need OS updates or external APIs.");

  // ── Supporting services
  if (want("secrets-manager")) {
    const sm = b.node("secrets", "secrets-manager", "Secrets Manager", region);
    for (const a of appNodes) b.edge(a, sm, "uses", { protocol: "HTTPS", port: 443, label: "read secret" });
  }
  if (want("cloudwatch")) {
    const cw = b.node("cloudwatch", "cloudwatch", "CloudWatch", region);
    for (const a of appNodes) b.edge(a, cw, "uses", { label: "logs and metrics" });
  }
  if (want("waf") && (entry === "cloudfront" || lb)) {
    const waf = b.node("waf", "waf", "WAF web ACL", region);
    b.edge(waf, entry === "cloudfront" ? "cloudfront" : lb!, "configures", { label: "web ACL" });
  }
  if (want("cognito")) {
    const c = b.node("cognito", "cognito", "Cognito user pool", region);
    b.edge("users", c, "connects", { protocol: "HTTPS", port: 443, label: "sign in" });
  }
  if (want("ecr")) {
    const r = b.node("ecr", "ecr", "ECR repository", region);
    for (const t of targets) b.edge(t, r, "uses", { protocol: "HTTPS", port: 443, label: "image pull" });
  }
  if (want("codebuild") || want("github")) {
    const gh = want("github") ? b.node("github", "github", "GitHub") : undefined;
    const cb = want("codebuild") ? b.node("codebuild", "codebuild", "CodeBuild project", region) : undefined;
    if (gh && cb) b.edge(gh, cb, "connects", { label: "start build" });
    const repo = b.nodes.find((n) => n.kind === "ecr")?.key;
    if (cb && repo) b.edge(cb, repo, "connects", { protocol: "HTTPS", port: 443, label: "push image" });
  }
  if (want("ssm") && targets.length) {
    const ssm = b.node("ssm", "ssm", "Session Manager", region);
    for (const t of targets) b.edge(t, ssm, "connects", { protocol: "HTTPS", port: 443, label: "agent (outbound)" });
  }

  if (!effectiveCompute && !fn && !want("s3") && !want("dynamodb")) {
    questions.push("Nothing runs the application yet. Add EC2, ECS, Lambda, or an S3 static site.");
  }
  return { graph: b.graph(), assumptions: dedupe(assumptions), questions, added: dedupeAdded(added), ignored };
}

// ─────────────────────────────── Azure ───────────────────────────────

function generateAzure(input: GenerateInput): GenerateResult {
  const want = (k: string) => count(input, k) > 0;
  const assumptions: string[] = [];
  const questions: string[] = [];
  const added: GenerateResult["added"] = [];
  const add = (kind: string, reason: string) => added.push({ kind, reason });
  const b = new Builder();
  const known = new Set(["azure-dns", "front-door", "application-gateway", "azure-lb", "nsg", "vm", "vmss", "app-service", "aks", "azure-sql", "private-endpoint", "azure-storage", "internet"]);
  const ignored = Object.keys(input.services).filter((k) => !known.has(k));

  const computeKind = want("vmss") ? "vmss" : want("vm") ? "vm" : want("aks") ? "aks" : want("app-service") ? "app-service" : null;
  const vnetCompute = computeKind && computeKind !== "app-service";
  let gw: "application-gateway" | "azure-lb" | null = want("application-gateway") ? "application-gateway" : want("azure-lb") ? "azure-lb" : null;
  const n = computeKind ? Math.max(count(input, computeKind), computeKind === "vmss" ? 1 : 1) : 0;
  if (!gw && vnetCompute && (n > 1 || computeKind === "vmss" || want("front-door"))) {
    gw = "application-gateway";
    add("application-gateway", "Distributes requests to the VMs, probes their health and terminates TLS inside the VNet.");
  }
  const needsVnet = Boolean(vnetCompute || gw || want("azure-sql") || want("private-endpoint"));

  b.node("users", "client", "Users");
  const region = b.boundary("region", "region", "East US · resource group rg-app");
  let vnet: string | undefined;
  if (needsVnet) {
    vnet = b.boundary("vnet", "vpc", "VNet 10.1.0.0/16", region);
    b.boundary("snet-gw", "subnet-public", "snet-appgw 10.1.0.0/24", vnet);
    b.boundary("snet-app", "subnet-private", "snet-app 10.1.1.0/24", vnet);
    b.boundary("snet-data", "subnet-private", "snet-data 10.1.2.0/24", vnet);
    assumptions.push("Region East US, one VNet with separate subnets for the gateway, the app and private endpoints.");
  }

  let gwNode: string | undefined;
  if (gw && vnet) {
    gwNode = b.node("gateway", gw, gw === "application-gateway" ? "Application Gateway (WAF v2)" : "Azure Load Balancer", gw === "application-gateway" ? "snet-gw" : "snet-app");
    if (gw === "application-gateway") assumptions.push("Application Gateway needs a dedicated subnet; it has a public frontend IP.");
  }

  const targets: string[] = [];
  if (computeKind) {
    const def = service(computeKind);
    if (computeKind === "vmss") {
      targets.push(b.node("vmss", "vmss", `VM scale set (${Math.max(n, 2)} instances, zones 1–2)`, "snet-app", { port: 8080 }));
      assumptions.push("The scale set is zone-redundant across availability zones 1 and 2.");
    } else if (computeKind === "app-service") {
      targets.push(b.node("app", "app-service", "App Service web app", region));
    } else {
      for (let i = 0; i < Math.max(n, 1); i++) targets.push(b.node(`${computeKind}-${i + 1}`, computeKind, `${def.label} ${i + 1}`, "snet-app", { port: 8080 }));
    }
  }
  if (gwNode) {
    for (const t of targets) {
      b.edge(gwNode, t, "routes-to", { protocol: "HTTP", port: 8080, label: "backend pool" });
      b.edge(gwNode, t, "health-checks", { protocol: "HTTP", port: 8080, label: "health probe" });
    }
  }
  if (vnet && targets.some((t) => t !== "app")) {
    const nsg = b.node("nsg-app", "nsg", gwNode ? "NSG snet-app: 8080 from snet-appgw" : "NSG snet-app", "snet-app");
    for (const t of targets.filter((x) => x !== "app")) b.edge(nsg, t, "attached-to", { label: "subnet association" });
    if (!want("nsg")) add("nsg", "Subnets carry NSGs that only allow the gateway subnet to reach the app port.");
  }

  let entry: string | undefined;
  if (want("front-door")) {
    entry = b.node("afd", "front-door", "Azure Front Door (WAF)");
    b.edge("users", entry, "connects", { protocol: "HTTPS", port: 443 });
    const origin = gwNode ?? targets[0];
    if (origin) b.edge(entry, origin, "connects", { protocol: "HTTPS", port: 443, label: "origin" });
    assumptions.push("Front Door proxies requests (unlike Route 53 or Azure DNS, which only answer lookups).");
  } else if (gwNode) {
    entry = gwNode;
    b.edge("users", gwNode, "connects", { protocol: "HTTPS", port: 443 });
  } else if (targets[0]) {
    entry = targets[0];
    b.edge("users", targets[0], "connects", { protocol: "HTTPS", port: 443 });
  }
  if (want("azure-dns")) {
    b.node("dns", "azure-dns", "Azure DNS zone");
    b.edge("users", "dns", "dns-resolves", { protocol: "DNS", port: 53 });
    if (entry) b.edge("dns", entry, "resolves-to", { label: want("front-door") ? "CNAME" : "A record" });
  }

  if (want("azure-sql")) {
    const sql = b.node("sql", "azure-sql", "Azure SQL database", region);
    if (vnet) {
      const pe = b.node("pe-sql", "private-endpoint", "Private endpoint (SQL)", "snet-data");
      if (!want("private-endpoint")) add("private-endpoint", "Keeps database traffic on a private IP in the VNet; public access stays disabled.");
      for (const t of targets) b.edge(t, pe, "connects", { protocol: "TDS", port: 1433 });
      b.edge(pe, sql, "routes-to", { label: "Private Link" });
    } else {
      for (const t of targets) b.edge(t, sql, "connects", { protocol: "TDS", port: 1433 });
    }
  }
  if (want("azure-storage")) {
    const st = b.node("storage", "azure-storage", "Storage account", region);
    for (const t of targets) b.edge(t, st, "connects", { protocol: "HTTPS", port: 443 });
  }
  if (!computeKind) questions.push("Which compute runs the app: VMs, a VM scale set, AKS or App Service?");
  return { graph: b.graph(), assumptions: dedupe(assumptions), questions, added: dedupeAdded(added), ignored };
}

function dedupe(a: string[]) {
  return [...new Set(a)];
}
function dedupeAdded(a: GenerateResult["added"]) {
  const seen = new Set<string>();
  return a.filter((x) => (seen.has(x.kind) ? false : (seen.add(x.kind), true)));
}
