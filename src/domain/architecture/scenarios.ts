/**
 * Deterministic process-flow simulations built from an architecture graph.
 * These are teaching simulations of how AWS/Azure behave, never live monitoring of real infrastructure.
 * The same graph always produces the same steps.
 */
import { COMPUTE_KINDS, DATA_KINDS, DNS_KINDS, LOAD_BALANCER_KINDS, SECURITY_FILTER_KINDS, service } from "./catalog";
import type { ArchEdge, ArchGraph, ArchNode } from "./graph";

export type FlowMode =
  | "normal"
  | "health-check-failure"
  | "sg-rejection"
  | "backend-failure"
  | "multi-az-failover"
  | "dns-failover"
  | "routing-failure";

export type Outcome = "OK" | "REJECTED" | "FAILED" | "FAILOVER";

export type FlowStep = {
  order: number;
  title: string;
  explanation: string;
  nodeKeys: string[];
  edgeKeys: string[];
  outcome: Outcome;
  durationMs: number;
};

export type Scenario = {
  mode: FlowMode;
  title: string;
  description: string;
  applicable: boolean;
  reason?: string;
  steps: FlowStep[];
};

export const FLOW_MODES: { mode: FlowMode; label: string; description: string }[] = [
  { mode: "normal", label: "Normal traffic", description: "A request travels from the user to the app and back." },
  { mode: "health-check-failure", label: "Health-check failure", description: "A target fails its health checks and is taken out of rotation." },
  { mode: "sg-rejection", label: "Security group rejection", description: "A missing inbound rule silently drops the traffic." },
  { mode: "backend-failure", label: "Backend application failure", description: "The app itself errors; what the user sees and why." },
  { mode: "multi-az-failover", label: "Multi-AZ failover", description: "One Availability Zone fails; the other keeps serving." },
  { mode: "dns-failover", label: "Route 53 DNS failover", description: "DNS switches users to a secondary endpoint." },
  { mode: "routing-failure", label: "Network routing failure", description: "A missing route makes outbound traffic time out." },
];

const SIDE_CALLS = new Set(["secrets-manager", "cloudwatch", "ecr", "ssm"]);
const PATH_RELATIONS: Record<string, number> = { "forwards-to": 0, registers: 1, invokes: 2, connects: 3, "routes-to": 4 };

class Ctx {
  nodes: Map<string, ArchNode>;
  byId: Map<string, ArchGraph["boundaries"][number]>;
  constructor(public g: ArchGraph) {
    this.nodes = new Map(g.nodes.map((n) => [n.key, n]));
    this.byId = new Map(g.boundaries.map((b) => [b.id, b]));
  }
  label(key: string) {
    return this.nodes.get(key)?.label ?? key;
  }
  kind(key: string) {
    return this.nodes.get(key)?.kind ?? "";
  }
  out(key: string, relation?: string) {
    return this.g.edges.filter((e) => e.source === key && (!relation || e.relation === relation));
  }
  into(key: string, relation?: string) {
    return this.g.edges.filter((e) => e.target === key && (!relation || e.relation === relation));
  }
  sgsOf(key: string) {
    return this.into(key, "attached-to").filter((e) => SECURITY_FILTER_KINDS.has(this.kind(e.source)));
  }
  az(key: string): string | undefined {
    let b = this.nodes.get(key)?.boundaryId ? this.byId.get(this.nodes.get(key)!.boundaryId!) : undefined;
    for (let i = 0; b && i < 10; i++) {
      if (b.kind === "az") return b.label;
      b = b.parentId ? this.byId.get(b.parentId) : undefined;
    }
    return undefined;
  }
  subnet(key: string) {
    const b = this.nodes.get(key)?.boundaryId ? this.byId.get(this.nodes.get(key)!.boundaryId!) : undefined;
    return b && b.kind.startsWith("subnet") ? b : undefined;
  }
  client() {
    return this.g.nodes.find((n) => n.kind === "client")?.key;
  }
}

const portText = (e?: ArchEdge) => (e?.protocol ? `${e.protocol}${e.port ? `:${e.port}` : ""}` : e?.port ? `port ${e.port}` : "");

/** The user's request path: client → entry → … following the most specific traffic edge at each hop. */
function requestPath(c: Ctx, preferTarget?: (key: string) => boolean): ArchEdge[] {
  const start = c.client();
  if (!start) return [];
  const dnsAnswer = c.g.edges.find((e) => e.relation === "resolves-to")?.target;
  const path: ArchEdge[] = [];
  const visited = new Set([start]);
  let cur = start;
  for (let hop = 0; hop < 12; hop++) {
    const options = c
      .out(cur)
      .filter((e) => e.relation in PATH_RELATIONS && !visited.has(e.target))
      .filter((e) => !DNS_KINDS.has(c.kind(e.target)) && c.kind(e.target) !== "cognito")
      // Side calls from the app (secrets, logs, image pulls, agents) are not the user's request.
      .filter((e) => !(COMPUTE_KINDS.has(c.kind(cur)) && SIDE_CALLS.has(c.kind(e.target))))
      .sort((a, b) => {
        const pref = (e: ArchEdge) => (preferTarget?.(e.target) ? -10 : 0) + (cur === start && e.target === dnsAnswer ? -5 : 0);
        return pref(a) - pref(b) || PATH_RELATIONS[a.relation]! - PATH_RELATIONS[b.relation]!;
      });
    const next = options[0];
    if (!next) break;
    path.push(next);
    visited.add(next.target);
    cur = next.target;
  }
  return path;
}

function hopStep(c: Ctx, e: ArchEdge): Omit<FlowStep, "order" | "durationMs"> {
  const s = c.label(e.source);
  const t = c.label(e.target);
  const sk = c.kind(e.source);
  const tk = c.kind(e.target);
  const sgs = c.sgsOf(e.target);
  const sgNote = sgs.length ? ` ${sgs.map((x) => c.label(x.source)).join(", ")} allows this traffic in.` : "";
  const nodeKeys = [e.source, e.target, ...sgs.map((x) => x.source)];
  const edgeKeys = [e.key, ...sgs.map((x) => x.key)];
  if (sk === "client") {
    const cert = c.into(e.target, "configures").find((x) => c.kind(x.source) === "acm");
    return {
      title: `Connect to ${t}`,
      explanation: `The browser opens a ${portText(e) || "network"} connection to ${t}.${cert ? ` TLS is terminated here with the ${c.label(cert.source)}.` : ""}${sgNote}`,
      nodeKeys: cert ? [...nodeKeys, cert.source] : nodeKeys,
      edgeKeys: cert ? [...edgeKeys, cert.key] : edgeKeys,
      outcome: "OK",
    };
  }
  if (e.relation === "forwards-to")
    return {
      title: "Listener rule matches",
      explanation: `The listener on ${s} evaluates its rules in priority order; the matching rule forwards the request to ${t}. A target group is routing configuration, not a separate network hop.`,
      nodeKeys, edgeKeys, outcome: "OK",
    };
  if (e.relation === "registers")
    return {
      title: `Pick a healthy target`,
      explanation: `${s} chooses a registered target that is passing health checks: ${t}. The load balancer sends the request to it on ${portText(e) || "the target port"}.${sgNote}`,
      nodeKeys, edgeKeys, outcome: "OK",
    };
  if (e.relation === "invokes")
    return { title: `Invoke ${t}`, explanation: `${s} invokes ${t}, passing the HTTP request as an event.`, nodeKeys, edgeKeys, outcome: "OK" };
  if (e.relation === "routes-to")
    return {
      title: `Route through ${t}`,
      explanation: `The subnet's route table sends ${s}'s traffic to ${t}. ${service(tk).description}`,
      nodeKeys, edgeKeys, outcome: "OK",
    };
  if (LOAD_BALANCER_KINDS.has(tk) || sk === "cloudfront" || sk === "front-door")
    return { title: `Forward to ${t}`, explanation: `${s} forwards the request to its origin ${t} over ${portText(e) || "HTTPS"}.${sgNote}`, nodeKeys, edgeKeys, outcome: "OK" };
  if (DATA_KINDS.has(tk))
    return { title: `Query ${t}`, explanation: `${s} reads or writes data in ${t} over ${portText(e) || "the network"}.${sgNote}`, nodeKeys, edgeKeys, outcome: "OK" };
  if (e.label) return { title: `${s} → ${t}`, explanation: `${s} → ${t}: ${e.label}${portText(e) ? ` (${portText(e)})` : ""}.${sgNote}`, nodeKeys, edgeKeys, outcome: "OK" };
  return { title: `${s} → ${t}`, explanation: `${s} connects to ${t} over ${portText(e) || "the network"}.${sgNote}`, nodeKeys, edgeKeys, outcome: "OK" };
}

function finalize(steps: Omit<FlowStep, "order" | "durationMs">[]): FlowStep[] {
  return steps.map((s, i) => ({ ...s, nodeKeys: [...new Set(s.nodeKeys)], edgeKeys: [...new Set(s.edgeKeys)], order: i + 1, durationMs: 2200 }));
}

function dnsStep(c: Ctx): Omit<FlowStep, "order" | "durationMs"> | undefined {
  const ask = c.g.edges.find((e) => e.relation === "dns-resolves");
  if (!ask) return undefined;
  const answer = c.out(ask.target, "resolves-to")[0];
  return {
    title: "Resolve the name",
    explanation: `The browser asks ${c.label(ask.target)} for the site's address. It answers with ${answer ? `the address of ${c.label(answer.target)} (${answer.label ?? "record"})` : "an IP address"}. DNS is not part of the request path after this answer.`,
    nodeKeys: [ask.source, ask.target, ...(answer ? [answer.target] : [])],
    edgeKeys: [ask.key, ...(answer ? [answer.key] : [])],
    outcome: "OK",
  };
}

function responseStep(c: Ctx, path: ArchEdge[]): Omit<FlowStep, "order" | "durationMs"> {
  const app = [...path].reverse().find((e) => COMPUTE_KINDS.has(c.kind(e.target)))?.target ?? path.at(-1)?.target;
  return {
    title: "Response returns",
    explanation: `${app ? c.label(app) : "The app"} builds the response. It travels back over the same connections to the browser; security groups are stateful, so return traffic needs no extra rule.`,
    nodeKeys: path.flatMap((e) => [e.source, e.target]),
    edgeKeys: path.map((e) => e.key),
    outcome: "OK",
  };
}

const na = (mode: FlowMode, reason: string): Scenario => {
  const m = FLOW_MODES.find((x) => x.mode === mode)!;
  return { mode, title: m.label, description: m.description, applicable: false, reason, steps: [] };
};
const ok = (mode: FlowMode, steps: Omit<FlowStep, "order" | "durationMs">[]): Scenario => {
  const m = FLOW_MODES.find((x) => x.mode === mode)!;
  return { mode, title: m.label, description: m.description, applicable: true, steps: finalize(steps) };
};

export function buildScenario(g: ArchGraph, mode: FlowMode): Scenario {
  const c = new Ctx(g);
  if (!c.client()) return na(mode, "Add a Users node so there is a request to follow.");
  const path = requestPath(c);
  if (!path.length) return na(mode, "Connect the Users node to an entry point (load balancer, CloudFront, API Gateway or an instance).");
  const dns = dnsStep(c);
  const lbEdge = path.find((e) => e.relation === "forwards-to");
  const lb = lbEdge?.source ?? path.find((e) => LOAD_BALANCER_KINDS.has(c.kind(e.target)))?.target;
  const tg = lbEdge?.target;
  const targets = tg ? c.out(tg, "registers").map((e) => e.target) : lb ? c.out(lb, "routes-to").map((e) => e.target).filter((k) => COMPUTE_KINDS.has(c.kind(k))) : [];

  switch (mode) {
    case "normal": {
      return ok(mode, [...(dns ? [dns] : []), ...path.map((e) => hopStep(c, e)), responseStep(c, path)]);
    }

    case "health-check-failure": {
      if (!lb || !targets.length) return na(mode, "Needs a load balancer with registered targets and health checks.");
      const hc = c.out(lb, "health-checks");
      const t1 = targets[0]!;
      const hc1 = hc.find((e) => e.target === t1);
      const others = targets.slice(1);
      const steps: Omit<FlowStep, "order" | "durationMs">[] = [
        {
          title: "Health checks run on their own",
          explanation: `${c.label(lb)} probes every target (${hc[0]?.label ?? "health check path"}) on a fixed interval. These probes are separate from user requests.`,
          nodeKeys: [lb, ...targets], edgeKeys: hc.map((e) => e.key), outcome: "OK",
        },
        {
          title: `${c.label(t1)} fails its check`,
          explanation: `The app on ${c.label(t1)} answers the probe with HTTP 500 (or not at all within the timeout). One failure is not enough: the target group counts consecutive failures.`,
          nodeKeys: [lb, t1], edgeKeys: hc1 ? [hc1.key] : [], outcome: "FAILED",
        },
        {
          title: "Target marked unhealthy",
          explanation: `After the unhealthy threshold (for example 3 checks in a row), ${tg ? c.label(tg) : "the load balancer"} marks ${c.label(t1)} unhealthy and stops routing new requests to it. In the console its reason shows Target.FailedHealthChecks or Target.ResponseCodeMismatch.`,
          nodeKeys: [tg ?? lb, t1], edgeKeys: c.into(t1, "registers").map((e) => e.key), outcome: "FAILED",
        },
      ];
      if (others.length) {
        const healthy = requestPath(c, (k) => k === others[0]);
        steps.push({
          title: `Traffic goes to ${c.label(others[0]!)}`,
          explanation: `New requests are only sent to healthy targets, so users keep being served by ${others.map((k) => c.label(k)).join(", ")}. Nobody sees an error.`,
          nodeKeys: healthy.flatMap((e) => [e.source, e.target]), edgeKeys: healthy.map((e) => e.key), outcome: "FAILOVER",
        });
      } else {
        steps.push({
          title: "No healthy targets left: 503",
          explanation: `${c.label(t1)} was the only target, so the load balancer has nowhere to send requests and answers 503 Service Unavailable. A second target in another AZ prevents this.`,
          nodeKeys: [lb, ...(tg ? [tg] : [])], edgeKeys: lbEdge ? [lbEdge.key] : [], outcome: "FAILED",
        });
      }
      steps.push({
        title: "Recovery",
        explanation: `Once ${c.label(t1)} passes the healthy threshold again (for example 2 checks in a row), it rejoins the rotation automatically.`,
        nodeKeys: [lb, t1], edgeKeys: hc1 ? [hc1.key] : [], outcome: "OK",
      });
      return ok(mode, steps);
    }

    case "sg-rejection": {
      const blockedEdge = path.find((e) => c.sgsOf(e.target).length && e.source !== c.client()) ?? path.find((e) => c.sgsOf(e.target).length);
      if (!blockedEdge) return na(mode, "Attach a security group (or NSG) to a resource on the request path.");
      const sg = c.sgsOf(blockedEdge.target)[0]!;
      const before = path.slice(0, path.indexOf(blockedEdge));
      const steps: Omit<FlowStep, "order" | "durationMs">[] = [...(dns ? [dns] : []), ...before.map((e) => hopStep(c, e))];
      steps.push({
        title: `${c.label(sg.source)} drops the packet`,
        explanation: `${c.label(sg.source)} has no inbound rule for ${portText(blockedEdge) || "this port"} from ${c.label(blockedEdge.source)}. Security groups have no deny rules and send no rejection: the packet is silently dropped.`,
        nodeKeys: [blockedEdge.source, blockedEdge.target, sg.source], edgeKeys: [blockedEdge.key, sg.key], outcome: "REJECTED",
      });
      const viaLb = lb && path.indexOf(blockedEdge) > path.findIndex((e) => e.target === lb);
      steps.push({
        title: viaLb ? "Timeout, then 504 / 503" : "Connection times out",
        explanation: viaLb
          ? `${c.label(lb!)} waits, then returns 504 Gateway Timeout. Its health checks are dropped too, so the target turns unhealthy and later requests get 503. Fix: allow ${portText(blockedEdge) || "the port"} from the load balancer's security group.`
          : `The client waits until its timeout and reports “connection timed out”, not “refused”. Fix: add an inbound rule for ${portText(blockedEdge) || "the port"} from the right source.`,
        nodeKeys: [viaLb ? lb! : blockedEdge.source, sg.source], edgeKeys: [sg.key], outcome: "FAILED",
      });
      return ok(mode, steps);
    }

    case "backend-failure": {
      const appEdge = path.find((e) => COMPUTE_KINDS.has(c.kind(e.target)));
      if (!appEdge) return na(mode, "Needs compute (EC2, ECS, Lambda, a VM…) on the request path.");
      const app = appEdge.target;
      const upTo = path.slice(0, path.indexOf(appEdge) + 1);
      const db = c.out(app, "connects").find((e) => DATA_KINDS.has(c.kind(e.target)));
      const steps: Omit<FlowStep, "order" | "durationMs">[] = [...(dns ? [dns] : []), ...upTo.map((e) => hopStep(c, e))];
      if (db)
        steps.push({
          title: `${c.label(db.target)} does not answer`,
          explanation: `${c.label(app)} tries ${c.label(db.target)} (${portText(db)}) and the query fails, for example because the database is overloaded or credentials changed.`,
          nodeKeys: [app, db.target], edgeKeys: [db.key], outcome: "FAILED",
        });
      steps.push({
        title: "The app errors",
        explanation: lb
          ? `${c.label(app)} crashes or closes the connection mid-request, so ${c.label(lb)} returns 502 Bad Gateway. (If the app answers with its own 500, that 500 is passed through unchanged.) 502 = bad answer from the target, 503 = no healthy target, 504 = no answer in time.`
          : `${c.label(app)} returns HTTP 500 to the user. Check the application logs first: the network path itself worked.`,
        nodeKeys: [app, ...(lb ? [lb] : [])], edgeKeys: [appEdge.key], outcome: "FAILED",
      });
      return ok(mode, steps);
    }

    case "multi-az-failover": {
      const azOf = new Map(targets.map((t) => [t, c.az(t)]));
      const azs = [...new Set([...azOf.values()].filter(Boolean))];
      const standby = c.g.edges.find((e) => e.relation === "failover" && c.kind(e.source) === c.kind(e.target));
      if (azs.length < 2 && !standby) return na(mode, "Needs targets in two Availability Zones, or a database with a Multi-AZ standby.");
      const badAz = azs[0] ?? c.az(standby!.source) ?? "the first AZ";
      const steps: Omit<FlowStep, "order" | "durationMs">[] = [];
      const lost = targets.filter((t) => azOf.get(t) === badAz);
      const kept = targets.filter((t) => azOf.get(t) && azOf.get(t) !== badAz);
      steps.push({
        title: `${badAz} becomes impaired`,
        explanation: `Simulated: a power or network event takes out ${badAz}. Everything placed only there stops responding.`,
        nodeKeys: [...lost, ...(standby ? [standby.source] : [])], edgeKeys: [], outcome: "FAILED",
      });
      if (lb && lost.length) {
        const hcs = c.out(lb, "health-checks").filter((e) => lost.includes(e.target));
        steps.push({
          title: "Health checks fail in that AZ",
          explanation: `${c.label(lb)} stops getting answers from ${lost.map((k) => c.label(k)).join(", ")} and marks them unhealthy.`,
          nodeKeys: [lb, ...lost], edgeKeys: hcs.map((e) => e.key), outcome: "FAILED",
        });
      }
      if (kept.length) {
        const p = requestPath(c, (k) => kept.includes(k));
        steps.push({
          title: "The other AZ keeps serving",
          explanation: `The load balancer has nodes in both AZs, so it keeps accepting requests and sends them to ${kept.map((k) => c.label(k)).join(", ")}. Capacity is halved until the AZ recovers or Auto Scaling replaces the lost instances.`,
          nodeKeys: p.flatMap((e) => [e.source, e.target]), edgeKeys: p.map((e) => e.key), outcome: "FAILOVER",
        });
      }
      if (standby) {
        steps.push({
          title: "Database fails over",
          explanation: `${c.label(standby.target)} is promoted to primary, typically within 60–120 seconds. The database endpoint's DNS name now points at it, so apps reconnect without a config change.`,
          nodeKeys: [standby.source, standby.target], edgeKeys: [standby.key], outcome: "FAILOVER",
        });
      }
      return ok(mode, steps);
    }

    case "dns-failover": {
      const dnsNode = c.g.nodes.find((n) => DNS_KINDS.has(n.kind));
      const answers = dnsNode ? c.out(dnsNode.key, "resolves-to") : [];
      const probe = dnsNode ? c.out(dnsNode.key, "health-checks") : [];
      if (!dnsNode || answers.length < 2)
        return na(mode, "Needs Route 53 with failover routing: a primary and a secondary record pointing at endpoints in different Regions. Open the “Route 53 regional failover” concept to see one.");
      const primary = answers.find((e) => /primary/i.test(e.label ?? "")) ?? answers[0]!;
      const secondary = answers.find((e) => e !== primary)!;
      const secondaryPath = requestPath(c, (k) => k === secondary.target);
      const ask = c.g.edges.find((e) => e.relation === "dns-resolves");
      return ok(mode, [
        {
          title: "Route 53 checks the primary",
          explanation: `A Route 53 health check probes ${c.label(primary.target)} from several locations. While it passes, DNS answers with the primary record.`,
          nodeKeys: [dnsNode.key, primary.target], edgeKeys: [...probe.filter((e) => e.target === primary.target).map((e) => e.key), primary.key], outcome: "OK",
        },
        {
          title: "Primary Region fails",
          explanation: `${c.label(primary.target)} stops answering. After the failure threshold the health check turns unhealthy.`,
          nodeKeys: [primary.target], edgeKeys: probe.filter((e) => e.target === primary.target).map((e) => e.key), outcome: "FAILED",
        },
        {
          title: "DNS answers with the secondary",
          explanation: `Route 53 now returns the secondary record, ${c.label(secondary.target)}. Clients switch once their cached answer expires (the record's TTL, e.g. 60 s).`,
          nodeKeys: [dnsNode.key, secondary.target, ...(ask ? [ask.source] : [])], edgeKeys: [secondary.key, ...(ask ? [ask.key] : [])], outcome: "FAILOVER",
        },
        {
          title: "Users reach the secondary Region",
          explanation: "Requests flow to the standby stack. Its data must already be replicated, or users see stale or missing data.",
          nodeKeys: secondaryPath.flatMap((e) => [e.source, e.target]), edgeKeys: secondaryPath.map((e) => e.key), outcome: "FAILOVER",
        },
      ]);
    }

    case "routing-failure": {
      const egress = c.g.edges.find((e) => e.relation === "routes-to" && c.subnet(e.source)?.kind === "subnet-private");
      if (egress) {
        const sub = c.subnet(egress.source)!;
        return ok(mode, [
          {
            title: `${c.label(egress.source)} sends traffic out`,
            explanation: `${c.label(egress.source)} needs to reach something outside its private subnet (package updates, an AWS API, Session Manager) through ${c.label(egress.target)}.`,
            nodeKeys: [egress.source, egress.target], edgeKeys: [egress.key], outcome: "OK",
          },
          {
            title: "No matching route",
            explanation: `Simulated misconfiguration: the route table of ${sub.label} has no entry that sends this destination to ${c.label(egress.target)}. Only the local VPC route matches, so the packets go nowhere.`,
            nodeKeys: [egress.source], edgeKeys: [egress.key], outcome: "FAILED",
          },
          {
            title: "Timeouts, not errors",
            explanation: "Every call hangs until it times out (for example “dial tcp …:443: i/o timeout”). Nothing is refused, which is the clue that it is routing, not permissions. Fix: add the route (0.0.0.0/0 → NAT gateway, or the endpoint's prefix list).",
            nodeKeys: [egress.source], edgeKeys: [], outcome: "FAILED",
          },
        ]);
      }
      const igw = c.g.nodes.find((n) => n.kind === "internet-gateway");
      const entryEdge = path[0]!;
      if (igw)
        return ok(mode, [
          { ...hopStep(c, entryEdge), title: "Request heads for the VPC" },
          {
            title: "Public route is missing",
            explanation: `Simulated misconfiguration: the public subnets' route table has no 0.0.0.0/0 → ${igw.label} entry. Traffic cannot enter or leave, so ${c.label(entryEdge.target)} is unreachable even though it is running.`,
            nodeKeys: [igw.key, entryEdge.target], edgeKeys: [entryEdge.key], outcome: "FAILED",
          },
          {
            title: "Timeouts everywhere",
            explanation: "Browsers time out, and instances cannot reach AWS APIs (for example the SSM agent logs “i/o timeout”). Fix: attach the internet gateway and add the 0.0.0.0/0 route.",
            nodeKeys: [igw.key], edgeKeys: [], outcome: "FAILED",
          },
        ]);
      return na(mode, "Needs a VPC with a route out (internet gateway, NAT gateway or endpoint) to break.");
    }
  }
}

export function buildAllScenarios(g: ArchGraph): Scenario[] {
  return FLOW_MODES.map((m) => buildScenario(g, m.mode));
}
