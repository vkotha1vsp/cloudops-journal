/**
 * Service catalog for Architecture Studio. One entry per service "kind" the graph model knows.
 * - role "traffic": a hop requests pass through or land on
 * - role "config": configuration attached to or used by a traffic node (SG, target group, certificate)
 * - tier: left-to-right column used by auto-layout (0 = the user, 5 = data)
 * - aliases: phrases the natural-language parser recognises (lower case, matched on word boundaries)
 */
export type Provider = "aws" | "azure" | "generic";
export type ServiceRole = "traffic" | "config";

export type ServiceDef = {
  kind: string;
  provider: Provider;
  label: string;
  short: string;
  category: string;
  role: ServiceRole;
  tier: number;
  /** Lives inside a VPC/VNet. */
  inVpc: boolean;
  /** Global service (outside any region box). */
  global?: boolean;
  color: string;
  aliases: string[];
  description: string;
};

const aws = (d: Omit<ServiceDef, "provider">): ServiceDef => ({ provider: "aws", ...d });
const az = (d: Omit<ServiceDef, "provider">): ServiceDef => ({ provider: "azure", ...d });

export const SERVICES: ServiceDef[] = [
  { kind: "client", provider: "generic", label: "Users", short: "USR", category: "Clients", role: "traffic", tier: 0, inVpc: false, global: true, color: "#64748b", aliases: ["user", "users", "browser", "client", "clients"], description: "People or systems sending requests." },
  { kind: "internet", provider: "generic", label: "Internet", short: "WWW", category: "Clients", role: "traffic", tier: 6, inVpc: false, global: true, color: "#64748b", aliases: ["internet", "external api", "third-party api"], description: "Any destination on the public internet." },
  { kind: "github", provider: "generic", label: "GitHub", short: "GH", category: "CI/CD", role: "traffic", tier: 0, inVpc: false, global: true, color: "#334155", aliases: ["github", "github actions"], description: "Source code and CI workflows." },

  // ── AWS: DNS and edge
  aws({ kind: "route53", label: "Route 53", short: "R53", category: "DNS and CDN", role: "traffic", tier: 1, inVpc: false, global: true, color: "#8c4fff", aliases: ["route 53", "route53", "r53", "dns"], description: "DNS: answers which address a name points to. It is not in the request path after the answer." }),
  aws({ kind: "cloudfront", label: "CloudFront", short: "CF", category: "DNS and CDN", role: "traffic", tier: 1, inVpc: false, global: true, color: "#8c4fff", aliases: ["cloudfront", "cdn"], description: "Content delivery network: caches and serves content from edge locations." }),
  aws({ kind: "acm", label: "ACM certificate", short: "ACM", category: "DNS and CDN", role: "config", tier: 1, inVpc: false, color: "#dd344c", aliases: ["acm", "certificate", "ssl", "tls", "https certificate", "certificate manager"], description: "TLS certificate used by a load balancer or CloudFront listener." }),
  aws({ kind: "waf", label: "AWS WAF", short: "WAF", category: "Identity and Security", role: "config", tier: 1, inVpc: false, color: "#dd344c", aliases: ["waf", "web application firewall"], description: "Web ACL attached to CloudFront, an ALB or API Gateway that blocks malicious requests." }),
  aws({ kind: "api-gateway", label: "API Gateway", short: "APIGW", category: "Compute", role: "traffic", tier: 2, inVpc: false, color: "#e7157b", aliases: ["api gateway", "apigateway", "rest api", "http api"], description: "Managed HTTPS front door for APIs." }),

  // ── AWS: networking
  aws({ kind: "internet-gateway", label: "Internet gateway", short: "IGW", category: "Networking", role: "traffic", tier: 2, inVpc: true, color: "#8c4fff", aliases: ["internet gateway", "igw"], description: "Lets a VPC's public subnets reach and be reached from the internet." }),
  aws({ kind: "nat-gateway", label: "NAT gateway", short: "NAT", category: "Networking", role: "traffic", tier: 2, inVpc: true, color: "#8c4fff", aliases: ["nat gateway", "nat"], description: "Gives private subnets outbound-only internet access." }),
  aws({ kind: "vpc-endpoint", label: "VPC endpoint", short: "VPCE", category: "Networking", role: "traffic", tier: 3, inVpc: true, color: "#8c4fff", aliases: ["vpc endpoint", "gateway endpoint", "interface endpoint", "privatelink"], description: "Private connection from a VPC to an AWS service without the internet." }),
  aws({ kind: "security-group", label: "Security group", short: "SG", category: "Networking", role: "config", tier: 3, inVpc: true, color: "#dd344c", aliases: ["security group", "security groups", "sg", "sgs"], description: "Stateful firewall attached to a resource's network interface. Not a hop in the request path." }),
  aws({ kind: "nacl", label: "Network ACL", short: "NACL", category: "Networking", role: "config", tier: 3, inVpc: true, color: "#dd344c", aliases: ["nacl", "network acl"], description: "Stateless subnet-level allow/deny rules." }),

  // ── AWS: load balancing
  aws({ kind: "alb", label: "Application Load Balancer", short: "ALB", category: "Load Balancing", role: "traffic", tier: 2, inVpc: true, color: "#8c4fff", aliases: ["application load balancer", "alb", "load balancer", "elb"], description: "Layer-7 load balancer: listeners evaluate rules and forward to target groups." }),
  aws({ kind: "nlb", label: "Network Load Balancer", short: "NLB", category: "Load Balancing", role: "traffic", tier: 2, inVpc: true, color: "#8c4fff", aliases: ["network load balancer", "nlb"], description: "Layer-4 load balancer for TCP/UDP at very high throughput." }),
  aws({ kind: "target-group", label: "Target group", short: "TG", category: "Load Balancing", role: "config", tier: 3, inVpc: true, color: "#8c4fff", aliases: ["target group", "target groups", "tg"], description: "Routing configuration: which targets, which port, and the health check. Not a network appliance." }),

  // ── AWS: compute
  aws({ kind: "ec2", label: "EC2 instance", short: "EC2", category: "Compute", role: "traffic", tier: 4, inVpc: true, color: "#ed7100", aliases: ["ec2", "ec2 instance", "ec2 instances", "instance", "instances", "server", "servers", "virtual machine"], description: "Virtual server running your application." }),
  aws({ kind: "asg", label: "Auto Scaling group", short: "ASG", category: "Compute", role: "config", tier: 3, inVpc: true, color: "#ed7100", aliases: ["auto scaling", "autoscaling", "auto scaling group", "asg"], description: "Keeps the desired number of EC2 instances running across AZs." }),
  aws({ kind: "ecs", label: "ECS Fargate task", short: "ECS", category: "Compute", role: "traffic", tier: 4, inVpc: true, color: "#ed7100", aliases: ["ecs", "fargate", "ecs fargate", "container", "containers"], description: "Container tasks run by ECS on Fargate." }),
  aws({ kind: "eks", label: "EKS pod", short: "EKS", category: "Compute", role: "traffic", tier: 4, inVpc: true, color: "#ed7100", aliases: ["eks", "kubernetes", "k8s"], description: "Pods on an Amazon EKS cluster." }),
  aws({ kind: "lambda", label: "Lambda function", short: "λ", category: "Compute", role: "traffic", tier: 4, inVpc: false, color: "#ed7100", aliases: ["lambda", "lambda function", "serverless function"], description: "Function that runs on demand, billed per invocation." }),
  aws({ kind: "codebuild", label: "CodeBuild", short: "CB", category: "CI/CD", role: "traffic", tier: 2, inVpc: false, color: "#3f8624", aliases: ["codebuild", "code build"], description: "Managed build service." }),
  aws({ kind: "ecr", label: "ECR repository", short: "ECR", category: "CI/CD", role: "traffic", tier: 3, inVpc: false, color: "#ed7100", aliases: ["ecr", "container registry", "elastic container registry"], description: "Private Docker image registry." }),
  aws({ kind: "ssm", label: "Session Manager", short: "SSM", category: "Management", role: "traffic", tier: 2, inVpc: false, color: "#e7157b", aliases: ["session manager", "ssm", "systems manager"], description: "Browser shell to instances without SSH or open ports." }),
  aws({ kind: "cognito", label: "Cognito", short: "COG", category: "Identity and Security", role: "traffic", tier: 1, inVpc: false, color: "#dd344c", aliases: ["cognito", "user pool", "login"], description: "User sign-in and tokens." }),
  aws({ kind: "secrets-manager", label: "Secrets Manager", short: "SM", category: "Identity and Security", role: "traffic", tier: 5, inVpc: false, color: "#dd344c", aliases: ["secrets manager", "secret", "secrets"], description: "Encrypted storage for passwords and keys." }),

  // ── AWS: data
  aws({ kind: "rds", label: "RDS database", short: "RDS", category: "Databases", role: "traffic", tier: 5, inVpc: true, color: "#c925d1", aliases: ["rds", "database", "postgres", "postgresql", "mysql", "aurora", "db"], description: "Managed relational database." }),
  aws({ kind: "dynamodb", label: "DynamoDB table", short: "DDB", category: "Databases", role: "traffic", tier: 5, inVpc: false, color: "#c925d1", aliases: ["dynamodb", "dynamo"], description: "Serverless key-value / document database." }),
  aws({ kind: "s3", label: "S3 bucket", short: "S3", category: "Storage", role: "traffic", tier: 5, inVpc: false, color: "#7aa116", aliases: ["s3", "bucket", "s3 bucket", "object storage"], description: "Object storage." }),
  aws({ kind: "efs", label: "EFS file system", short: "EFS", category: "Storage", role: "traffic", tier: 5, inVpc: true, color: "#7aa116", aliases: ["efs", "elastic file system"], description: "Shared NFS file system." }),
  aws({ kind: "cloudwatch", label: "CloudWatch", short: "CW", category: "Monitoring", role: "config", tier: 5, inVpc: false, color: "#e7157b", aliases: ["cloudwatch", "monitoring", "logs"], description: "Metrics, logs and alarms." }),

  // ── Azure
  az({ kind: "azure-dns", label: "Azure DNS", short: "DNS", category: "Networking", role: "traffic", tier: 1, inVpc: false, global: true, color: "#0078d4", aliases: ["azure dns"], description: "DNS hosting for your domains." }),
  az({ kind: "front-door", label: "Azure Front Door", short: "AFD", category: "Load Balancing and Delivery", role: "traffic", tier: 1, inVpc: false, global: true, color: "#0078d4", aliases: ["front door", "azure front door", "afd"], description: "Global layer-7 entry point with CDN and WAF. Unlike Route 53 it does proxy requests." }),
  az({ kind: "application-gateway", label: "Application Gateway", short: "AGW", category: "Load Balancing and Delivery", role: "traffic", tier: 2, inVpc: true, color: "#0078d4", aliases: ["application gateway", "app gateway", "appgw"], description: "Regional layer-7 load balancer that lives in its own subnet; optional WAF." }),
  az({ kind: "azure-lb", label: "Azure Load Balancer", short: "LB", category: "Load Balancing and Delivery", role: "traffic", tier: 2, inVpc: true, color: "#0078d4", aliases: ["azure load balancer"], description: "Layer-4 load balancer." }),
  az({ kind: "nsg", label: "Network security group", short: "NSG", category: "Networking", role: "config", tier: 3, inVpc: true, color: "#0078d4", aliases: ["nsg", "network security group"], description: "Allow/deny rules associated with a subnet or NIC. Not a traffic hop." }),
  az({ kind: "vm", label: "Virtual machine", short: "VM", category: "Compute", role: "traffic", tier: 4, inVpc: true, color: "#0078d4", aliases: ["virtual machine", "vm", "vms"], description: "Azure VM." }),
  az({ kind: "vmss", label: "VM scale set", short: "VMSS", category: "Compute", role: "traffic", tier: 4, inVpc: true, color: "#0078d4", aliases: ["vm scale set", "scale set", "vmss", "virtual machine scale set"], description: "Group of identical VMs that scale together." }),
  az({ kind: "app-service", label: "App Service", short: "APP", category: "Compute", role: "traffic", tier: 4, inVpc: false, color: "#0078d4", aliases: ["app service", "web app"], description: "Managed web app hosting." }),
  az({ kind: "aks", label: "AKS pod", short: "AKS", category: "Containers", role: "traffic", tier: 4, inVpc: true, color: "#0078d4", aliases: ["aks", "azure kubernetes service"], description: "Pods on Azure Kubernetes Service." }),
  az({ kind: "azure-sql", label: "Azure SQL", short: "SQL", category: "Storage and Data", role: "traffic", tier: 5, inVpc: false, color: "#0078d4", aliases: ["azure sql", "sql database"], description: "Managed SQL database, reached privately through a private endpoint." }),
  az({ kind: "private-endpoint", label: "Private endpoint", short: "PE", category: "Networking", role: "traffic", tier: 5, inVpc: true, color: "#0078d4", aliases: ["private endpoint", "private link"], description: "A private IP in your VNet for a PaaS service." }),
  az({ kind: "azure-storage", label: "Storage account", short: "STG", category: "Storage and Data", role: "traffic", tier: 5, inVpc: false, color: "#0078d4", aliases: ["storage account", "blob storage", "azure storage"], description: "Blob, file, queue and table storage." }),
];

export const SERVICE_BY_KIND: Record<string, ServiceDef> = Object.fromEntries(SERVICES.map((s) => [s.kind, s]));

export function service(kind: string): ServiceDef {
  return (
    SERVICE_BY_KIND[kind] ?? {
      kind, provider: "generic", label: kind, short: kind.slice(0, 4).toUpperCase(), category: "Other", role: "traffic",
      tier: 3, inVpc: false, color: "#64748b", aliases: [], description: "",
    }
  );
}

/** Services shown in the Studio palette for a provider (clients last). */
export function paletteFor(provider: "aws" | "azure"): ServiceDef[] {
  return SERVICES.filter((s) => s.provider === provider || (s.provider === "generic" && s.kind !== "github"));
}

export const LOAD_BALANCER_KINDS = new Set(["alb", "nlb", "application-gateway", "azure-lb", "front-door"]);
export const DNS_KINDS = new Set(["route53", "azure-dns"]);
export const SECURITY_FILTER_KINDS = new Set(["security-group", "nsg", "nacl"]);
export const COMPUTE_KINDS = new Set(["ec2", "ecs", "eks", "lambda", "vm", "vmss", "app-service", "aks"]);
export const DATA_KINDS = new Set(["rds", "dynamodb", "s3", "efs", "azure-sql", "azure-storage", "secrets-manager"]);
