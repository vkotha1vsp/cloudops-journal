/**
 * Concept library: ready-made, interactive reference architectures shown in Architecture Studio and on
 * matching learning-topic pages. They live in code (always up to date, no database rows); "Open a copy"
 * in the Studio saves an editable copy to your own diagrams.
 */
import { Builder, generate } from "./build";
import type { ArchGraph } from "./graph";
import { parseRequest } from "./parse";

export type Concept = {
  id: string;
  title: string;
  provider: "aws" | "azure";
  summary: string;
  /** Learning-topic titles (as in the knowledge trees) this concept illustrates. */
  topics: string[];
  /** Natural-language request that reproduces it in the Studio, when it is generated. */
  request?: string;
  build: () => { graph: ArchGraph; assumptions: string[] };
};

const fromText = (text: string) => () => {
  const r = generate(parseRequest(text));
  return { graph: r.graph, assumptions: r.assumptions };
};

function route53Failover() {
  const b = new Builder();
  b.node("users", "client", "Users");
  b.node("route53", "route53", "Route 53 (failover routing)");
  for (const [r, name, label] of [["east", "us-east-1", "primary"], ["west", "us-west-2", "secondary"]] as const) {
    b.boundary(`region-${r}`, "region", `Region ${name} (${label})`);
    b.boundary(`vpc-${r}`, "vpc", `VPC ${r === "east" ? "10.0.0.0/16" : "10.1.0.0/16"}`, `region-${r}`);
    b.boundary(`az-${r}`, "az", `${name}a`, `vpc-${r}`);
    b.boundary(`app-${r}`, "subnet-private", "Private app subnet", `az-${r}`);
    b.boundary(`data-${r}`, "subnet-private", "Private data subnet", `az-${r}`);
    b.node(`alb-${r}`, "alb", `ALB ${name}`, `vpc-${r}`);
    b.node(`tg-${r}`, "target-group", `Target group ${name}`, `vpc-${r}`);
    b.node(`ec2-${r}`, "ec2", `EC2 app ${name}`, `app-${r}`, { port: 80 });
    b.node(`rds-${r}`, "rds", r === "east" ? "RDS primary" : "RDS cross-Region replica", `data-${r}`);
    b.edge(`alb-${r}`, `tg-${r}`, "forwards-to", { label: "HTTPS:443 listener rule" });
    b.edge(`tg-${r}`, `ec2-${r}`, "registers", { protocol: "HTTP", port: 80 });
    b.edge(`alb-${r}`, `ec2-${r}`, "health-checks", { protocol: "HTTP", port: 80, label: "GET /health" });
    b.edge(`ec2-${r}`, `rds-${r}`, "connects", { protocol: "PostgreSQL", port: 5432 });
    b.edge("route53", `alb-${r}`, "resolves-to", { label: label === "primary" ? "primary record" : "secondary record" });
    b.edge("users", `alb-${r}`, "connects", { protocol: "HTTPS", port: 443 });
  }
  b.edge("users", "route53", "dns-resolves", { protocol: "DNS", port: 53 });
  b.edge("route53", "alb-east", "health-checks", { protocol: "HTTPS", port: 443, label: "Route 53 health check" });
  b.edge("rds-east", "rds-west", "replicates", { label: "asynchronous" });
  b.edge("alb-east", "alb-west", "failover", { label: "DNS failover" });
  return {
    graph: b.graph(),
    assumptions: [
      "Two complete stacks in two Regions; only the primary serves while healthy (active-passive).",
      "The database replica in us-west-2 is promoted manually or by automation after failover.",
      "The DNS record TTL (e.g. 60 s) sets how quickly clients switch.",
    ],
  };
}

function cloudOpsJournal() {
  const b = new Builder();
  b.node("users", "client", "You (browser)");
  b.node("route53", "route53", "Route 53: learn.<domain>");
  b.node("github", "github", "GitHub Actions");
  b.boundary("region", "region", "Region us-east-1");
  b.boundary("vpc", "vpc", "VPC (with internet gateway)", "region");
  b.boundary("az-a", "az", "us-east-1a", "vpc");
  b.boundary("public-a", "subnet-public", "Public subnet (route 0.0.0.0/0 → IGW)", "az-a");
  b.node("acm", "acm", "ACM certificate learn.<domain>", "region");
  b.node("alb", "alb", "cloudops-journal-alb", "vpc");
  b.node("tg", "target-group", "cloudops-journal-tg HTTP:3000", "vpc");
  b.node("igw", "internet-gateway", "Internet gateway", "vpc");
  b.node("ec2", "ec2", "EC2 cloudops-journal (app + Postgres)", "public-a", { port: 3000 });
  b.node("sg-alb", "security-group", "cloudops-alb-sg: 80/443 from internet", "vpc");
  b.node("sg-app", "security-group", "cloudops-app-sg: 3000 from ALB SG", "vpc");
  b.node("cognito", "cognito", "Cognito user pool", "region");
  b.node("secrets", "secrets-manager", "Secret cloudops-journal/app", "region");
  b.node("s3", "s3", "S3 attachments + backups", "region");
  b.node("codebuild", "codebuild", "CodeBuild cloudops-journal-image", "region");
  b.node("ecr", "ecr", "ECR cloudops-journal", "region");
  b.edge("users", "route53", "dns-resolves", { protocol: "DNS", port: 53 });
  b.edge("route53", "alb", "resolves-to", { label: "alias record" });
  b.edge("users", "alb", "connects", { protocol: "HTTPS", port: 443 });
  b.edge("acm", "alb", "configures", { label: "listener certificate" });
  b.edge("alb", "tg", "forwards-to", { label: "HTTPS:443 default rule" });
  b.edge("tg", "ec2", "registers", { protocol: "HTTP", port: 3000 });
  b.edge("alb", "ec2", "health-checks", { protocol: "HTTP", port: 3000, label: "GET /api/health" });
  b.edge("sg-alb", "alb", "attached-to");
  b.edge("sg-app", "ec2", "attached-to");
  b.edge("users", "cognito", "connects", { protocol: "HTTPS", port: 443, label: "sign in" });
  b.edge("ec2", "secrets", "uses", { protocol: "HTTPS", port: 443, label: "read secret at deploy" });
  b.edge("ec2", "s3", "connects", { protocol: "HTTPS", port: 443, label: "attachments and nightly backup" });
  b.edge("ec2", "ecr", "uses", { protocol: "HTTPS", port: 443, label: "image pull" });
  b.edge("github", "codebuild", "connects", { label: "start build for the commit" });
  b.edge("codebuild", "ecr", "connects", { protocol: "HTTPS", port: 443, label: "push image" });
  return {
    graph: b.graph(),
    assumptions: [
      "This is your own deployment as built in the console guide.",
      "The instance has a public IP only for outbound traffic; its security group accepts port 3000 from the load balancer alone.",
    ],
  };
}

function ciPipeline() {
  const b = new Builder();
  b.node("dev", "client", "Developer");
  b.node("github", "github", "GitHub (main branch)");
  b.boundary("region", "region", "Region us-east-1");
  b.boundary("vpc", "vpc", "VPC", "region");
  b.boundary("subnet", "subnet-public", "App subnet", "vpc");
  b.node("codebuild", "codebuild", "CodeBuild project", "region");
  b.node("ecr", "ecr", "ECR repository", "region");
  b.node("ssm", "ssm", "SSM Run Command", "region");
  b.node("ec2", "ec2", "EC2 app server", "subnet", { port: 3000 });
  b.edge("dev", "github", "connects", { label: "git push; Actions runs the tests" });
  b.edge("github", "codebuild", "connects", { label: "starts a build pinned to the commit (OIDC role, no stored keys)" });
  b.edge("codebuild", "ecr", "connects", { protocol: "HTTPS", port: 443, label: "builds the Docker image and pushes tags <sha> and latest" });
  b.edge("ecr", "ssm", "connects", { label: "GitHub Actions then asks SSM to run deploy.sh <sha>" });
  b.edge("ssm", "ec2", "connects", { label: "deploy.sh pulls the image, migrates the database, restarts, health-checks, rolls back on failure" });
  return { graph: b.graph(), assumptions: ["Matches the deploy-ec2.yml workflow in your repository."] };
}

export const CONCEPTS: Concept[] = [
  {
    id: "alb-web-app",
    title: "Web app behind an Application Load Balancer",
    provider: "aws",
    summary: "Route 53 resolves the name, the ALB terminates HTTPS and forwards through a target group to EC2 in two AZs, which use a Multi-AZ RDS database.",
    topics: ["Application Load Balancer", "Target Groups", "Health Checks", "EC2", "Security Groups", "Route 53", "Multi-AZ", "RDS", "AWS Certificate Manager", "VPC", "Subnets"],
    request: "Route 53, an Application Load Balancer, Target Group, two EC2 instances, Security Groups and RDS",
    build: fromText("Route 53, an Application Load Balancer, Target Group, two EC2 instances, Security Groups and RDS"),
  },
  {
    id: "static-site",
    title: "Static website on CloudFront and S3",
    provider: "aws",
    summary: "CloudFront serves cached content over HTTPS from edge locations; the private S3 bucket is its origin, reachable only through Origin Access Control.",
    topics: ["CloudFront", "S3", "AWS Certificate Manager", "Route 53"],
    request: "static website with CloudFront, S3, ACM and Route 53",
    build: fromText("static website with CloudFront, S3, ACM and Route 53"),
  },
  {
    id: "serverless-api",
    title: "Serverless API",
    provider: "aws",
    summary: "API Gateway gives an HTTPS endpoint, invokes Lambda per request, and Lambda reads and writes DynamoDB. No servers or VPC to manage.",
    topics: ["Lambda", "DynamoDB"],
    request: "serverless API with API Gateway, Lambda and DynamoDB",
    build: fromText("serverless API with API Gateway, Lambda and DynamoDB"),
  },
  {
    id: "nat-egress",
    title: "Private subnets with a NAT gateway",
    provider: "aws",
    summary: "Instances in private subnets accept traffic only from the load balancer and reach the internet outbound through a NAT gateway in a public subnet.",
    topics: ["NAT Gateway", "Internet Gateway", "Subnets", "Route Tables", "Network ACLs"],
    request: "ALB, two EC2 instances in private subnets, NAT gateway and an external API on the internet",
    build: fromText("ALB, two EC2 instances in private subnets, NAT gateway and an external internet API"),
  },
  {
    id: "vpc-endpoint",
    title: "Reaching S3 privately with a VPC endpoint",
    provider: "aws",
    summary: "A free gateway endpoint lets private instances use S3 without a NAT gateway or internet route.",
    topics: ["VPC Endpoints", "PrivateLink"],
    request: "ALB, two EC2 instances and an S3 bucket",
    build: fromText("ALB, two EC2 instances and an S3 bucket"),
  },
  {
    id: "ecs-fargate",
    title: "Containers on ECS Fargate",
    provider: "aws",
    summary: "An ALB forwards to ECS Fargate tasks (IP targets) that pull images from ECR, read credentials from Secrets Manager and use RDS.",
    topics: ["ECS", "ECR", "Secrets Manager", "Auto Scaling"],
    request: "ALB, two ECS Fargate tasks, ECR, Secrets Manager and RDS",
    build: fromText("ALB, two ECS fargate tasks, ECR, secrets manager and RDS postgres"),
  },
  {
    id: "route53-failover",
    title: "Route 53 regional failover",
    provider: "aws",
    summary: "Two Regions run the same stack. Route 53 health-checks the primary and answers with the secondary record when it fails.",
    topics: ["Route 53 Failover", "Multi-Region", "Route 53"],
    build: route53Failover,
  },
  {
    id: "cloudops-journal",
    title: "This site: CloudOps Journal on EC2",
    provider: "aws",
    summary: "Your own deployment: Route 53, ALB with ACM, one EC2 instance running the app and Postgres, Cognito login, and the GitHub → CodeBuild → ECR pipeline.",
    topics: ["EC2", "Application Load Balancer", "Cognito", "CodeBuild", "ECR", "Secrets Manager"],
    build: cloudOpsJournal,
  },
  {
    id: "ci-pipeline",
    title: "CI/CD: GitHub → CodeBuild → ECR → EC2",
    provider: "aws",
    summary: "A push runs the tests, CodeBuild builds and pushes the image, and SSM runs the deploy script on the server.",
    topics: ["CodeBuild", "CodePipeline", "ECR", "GitHub Actions", "Docker images"],
    build: ciPipeline,
  },
  {
    id: "azure-web",
    title: "Azure web tier: Front Door to VM scale set",
    provider: "azure",
    summary: "Front Door (global, proxies requests) sends traffic to Application Gateway in its own subnet, which balances across a zone-redundant VM scale set that reaches Azure SQL via a private endpoint.",
    topics: ["Azure Front Door", "Application Gateway", "Virtual Machines", "Azure SQL", "Network Security Groups", "Azure DNS", "Virtual Networks and Subnets", "Azure Private Link"],
    request: "Azure DNS, Front Door, Application Gateway, VM scale set and Azure SQL",
    build: fromText("Azure DNS, Azure Front Door, Application Gateway, VM scale set and Azure SQL"),
  },
  {
    id: "azure-app-service",
    title: "Azure App Service with SQL and Storage",
    provider: "azure",
    summary: "A managed web app (no VMs) using Azure SQL and a storage account, fronted by Azure DNS.",
    topics: ["Azure App Service", "Azure Storage", "Azure SQL"],
    request: "Azure DNS, App Service, Azure SQL and a storage account",
    build: fromText("Azure DNS, Azure app service, Azure SQL and azure storage account"),
  },
];

const cache = new Map<string, ReturnType<Concept["build"]>>();

export function conceptGraph(id: string) {
  const c = CONCEPTS.find((x) => x.id === id);
  if (!c) return undefined;
  if (!cache.has(id)) cache.set(id, c.build());
  return { concept: c, ...cache.get(id)! };
}

export function conceptsForTopic(title: string): Concept[] {
  const t = title.trim().toLowerCase();
  return CONCEPTS.filter((c) => c.topics.some((x) => x.toLowerCase() === t));
}
