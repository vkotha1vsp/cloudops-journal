import { SERVICES, type Provider } from "./catalog";

export type ParsedRequest = {
  provider: "aws" | "azure";
  /** kind → count requested (1 when no number was given) */
  services: Record<string, number>;
  /** phrases recognised, for display */
  matched: { phrase: string; kind: string; count: number }[];
  flags: { multiAz?: boolean; singleAz?: boolean; privateSubnets?: boolean; https?: boolean; dbEngine?: "postgres" | "mysql" };
};

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, single: 1, two: 2, pair: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const NUM = Object.keys(NUMBER_WORDS).join("|");

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Recognises services in free text such as
 * "Create an AWS architecture using Route 53, an Application Load Balancer, Target Group, two EC2 instances,
 *  Security Groups, and RDS."
 * Longest aliases win, so "application load balancer" is not also read as "load balancer".
 */
export function parseRequest(text: string): ParsedRequest {
  const input = ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9.\- ]+/g, " ")
    .replace(/\broute\s+53\b/g, "route53")
    .replace(/\s+/g, " ")} `;
  const azureHint = /\b(azure|vnet|nsg|front door|app service|entra)\b/.test(input);
  const awsHint = /\b(aws|ec2|vpc|route 53|route53|alb|rds|lambda|s3|cloudfront)\b/.test(input);
  const provider: "aws" | "azure" = azureHint && !awsHint ? "azure" : "aws";

  const candidates = SERVICES.filter((s) => s.provider === provider || s.provider === "generic")
    .flatMap((s) => s.aliases.map((a) => ({ alias: a, kind: s.kind, provider: s.provider as Provider })))
    .sort((a, b) => b.alias.length - a.alias.length);

  const taken: [number, number][] = [];
  const overlaps = (a: number, b: number) => taken.some(([x, y]) => a < y && b > x);
  const services: Record<string, number> = {};
  const matched: ParsedRequest["matched"] = [];

  for (const c of candidates) {
    // "<number> [one adjective] <service>", e.g. "two ec2 instances", "3 private instances".
    const re = new RegExp(`(?:\\b(\\d+|${NUM})\\s+(?:(?!(?:${NUM})\\b)[a-z-]+\\s+)?)?\\b${escape(c.alias)}\\b`, "g");
    for (const m of input.matchAll(re)) {
      const start = m.index ?? 0;
      const aliasStart = start + m[0].length - c.alias.length;
      if (overlaps(aliasStart, aliasStart + c.alias.length)) continue;
      taken.push([aliasStart, aliasStart + c.alias.length]);
      const word = m[1];
      const n = word ? (/^\d+$/.test(word) ? Math.min(Number(word), 8) : NUMBER_WORDS[word] ?? 1) : 1;
      services[c.kind] = Math.max(services[c.kind] ?? 0, n);
      matched.push({ phrase: c.alias, kind: c.kind, count: n });
    }
  }
  delete services.client; // users are always added

  const flags: ParsedRequest["flags"] = {};
  if (/\b(multi-az|multi az|two azs|2 azs|high availability|highly available)\b/.test(input)) flags.multiAz = true;
  if (/\b(single az|one az|single-az)\b/.test(input)) flags.singleAz = true;
  if (/\bprivate\b/.test(input)) flags.privateSubnets = true;
  if (/\b(https|tls|ssl)\b/.test(input)) flags.https = true;
  if (/\b(postgres|postgresql)\b/.test(input)) flags.dbEngine = "postgres";
  if (/\bmysql\b/.test(input)) flags.dbEngine = "mysql";

  return { provider, services, matched, flags };
}
