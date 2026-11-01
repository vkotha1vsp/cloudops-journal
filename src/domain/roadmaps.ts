/**
 * Curated learning roadmaps. Each item names a topic title; the page matches it against the
 * user's own knowledge tree (case-insensitive), so renamed or deleted topics simply show as
 * "not in your tree" rather than breaking. Progress comes from LearningProgress.
 */
export type RoadmapItem = { topic: string; track: "AWS" | "AZURE" | "DEVOPS"; why: string; concept?: string; lab?: string };
export type Roadmap = { id: string; title: string; description: string; stages: { title: string; items: RoadmapItem[] }[] };

const aws = (topic: string, why: string, extra: Partial<RoadmapItem> = {}): RoadmapItem => ({ topic, track: "AWS", why, ...extra });
const az = (topic: string, why: string, extra: Partial<RoadmapItem> = {}): RoadmapItem => ({ topic, track: "AZURE", why, ...extra });
const dev = (topic: string, why: string, extra: Partial<RoadmapItem> = {}): RoadmapItem => ({ topic, track: "DEVOPS", why, ...extra });

export const ROADMAPS: Roadmap[] = [
  {
    id: "aws-foundations",
    title: "AWS cloud engineer foundations",
    description: "From a single instance to a highly available, HTTPS web tier with a managed database.",
    stages: [
      {
        title: "1 · Networking first",
        items: [
          dev("CIDR and subnetting", "Every VPC decision starts with address ranges."),
          aws("VPC", "The private network everything else lives in."),
          aws("Subnets", "Public vs private is a routing decision, not a checkbox.", { concept: "nat-egress" }),
          aws("Route Tables", "Where packets go; most 'can't connect' issues end here."),
          aws("Internet Gateway", "The only path to and from the internet for public subnets."),
          aws("NAT Gateway", "Outbound-only internet for private subnets.", { concept: "nat-egress" }),
          aws("Security Groups", "Stateful, attached to resources, allow-only.", { lab: "ec2-nginx" }),
        ],
      },
      {
        title: "2 · Compute and load balancing",
        items: [
          aws("EC2", "The building block behind most other services.", { lab: "ec2-nginx" }),
          aws("Application Load Balancer", "Layer 7 routing with listeners and rules.", { concept: "alb-web-app", lab: "alb-target-groups" }),
          aws("Target Groups", "Configuration that says where the ALB forwards.", { lab: "alb-target-groups" }),
          aws("Health Checks", "Separate from user traffic; decides who gets requests.", { lab: "alb-target-groups" }),
          aws("Auto Scaling", "Replaces unhealthy instances and follows demand."),
        ],
      },
      {
        title: "3 · DNS, TLS and the edge",
        items: [
          dev("DNS resolution", "Clients resolve, then connect; DNS is not a proxy."),
          aws("Route 53", "Alias records to AWS resources.", { lab: "route53-acm" }),
          aws("AWS Certificate Manager", "Free public certs, DNS-validated.", { lab: "route53-acm" }),
          aws("CloudFront", "Caching and TLS at the edge.", { concept: "static-site", lab: "cloudfront-s3" }),
        ],
      },
      {
        title: "4 · Data, identity and operations",
        items: [
          aws("RDS", "Managed relational database, Multi-AZ standby."),
          aws("S3", "Object storage, private by default."),
          aws("IAM", "Roles over keys; least privilege."),
          aws("VPC Endpoints", "Reach AWS APIs privately.", { concept: "vpc-endpoint", lab: "ssm-private-ec2" }),
          aws("CloudWatch", "Metrics, logs and alarms."),
          aws("Multi-AZ", "Survive the loss of a data center.", { concept: "alb-web-app" }),
          aws("Route 53 Failover", "Survive the loss of a region.", { concept: "route53-failover", lab: "route53-failover" }),
        ],
      },
    ],
  },
  {
    id: "devops-pipeline",
    title: "DevOps: code to container to cloud",
    description: "Build, scan, package and deploy, the way this site itself is delivered.",
    stages: [
      {
        title: "1 · Basics",
        items: [
          dev("Bash scripting", "Glue for every pipeline."),
          dev("Git branching", "How changes move safely."),
          dev("Pull request workflow", "Reviews and checks before merge."),
        ],
      },
      {
        title: "2 · Containers",
        items: [
          dev("Docker images", "Reproducible builds; multi-stage for small images."),
          dev("Docker networking", "Ports, bridge networks and service names."),
          dev("Docker Compose", "Run the app and its database locally."),
          aws("ECR", "Private registry with scan on push.", { lab: "jenkins-ecr" }),
        ],
      },
      {
        title: "3 · Pipelines",
        items: [
          dev("GitHub Actions", "CI on every push.", { concept: "ci-pipeline" }),
          aws("CodeBuild", "Managed builds with IAM roles instead of keys.", { concept: "cloudops-journal" }),
          dev("Jenkins", "Still everywhere in enterprises.", { lab: "jenkins-ecr" }),
          dev("SonarQube", "Quality gates that block bad changes.", { lab: "sonarqube-ci" }),
        ],
      },
      {
        title: "4 · Run it",
        items: [
          dev("Terraform state", "The source of truth for what exists."),
          dev("Terraform modules", "Reuse without copy-paste."),
          aws("ECS", "Containers without managing a cluster.", { concept: "ecs-fargate" }),
          dev("Pods and Deployments", "Kubernetes' unit of scheduling and rollout."),
          aws("EKS", "Managed Kubernetes on AWS.", { lab: "eks-deploy" }),
          dev("Metrics", "Know it's broken before users tell you."),
          dev("Alerting", "Page on symptoms, not causes."),
        ],
      },
    ],
  },
  {
    id: "azure-for-aws",
    title: "Azure for AWS engineers",
    description: "Map what you know to Azure, noting where the behaviour differs.",
    stages: [
      {
        title: "1 · Network",
        items: [
          az("Virtual Networks and Subnets", "Like VPCs, but subnets span all zones in a region."),
          az("Network Security Groups", "Attach to subnets or NICs; rules have priorities, including deny."),
          az("Azure Private Link", "Private endpoints get an IP in your subnet."),
        ],
      },
      {
        title: "2 · Traffic",
        items: [
          az("Azure DNS", "Hosted zones, comparable to Route 53 public zones."),
          az("Azure Front Door", "Global layer 7 entry point; closer to CloudFront + ALB than to either.", { concept: "azure-web" }),
          az("Application Gateway", "Regional layer 7 load balancer with optional WAF.", { concept: "azure-web" }),
          az("Azure Load Balancer", "Layer 4, like NLB."),
        ],
      },
      {
        title: "3 · Compute and data",
        items: [
          az("Virtual Machines", "VM scale sets for groups."),
          az("Azure App Service", "PaaS web hosting.", { concept: "azure-app-service" }),
          az("Azure Kubernetes Service", "Managed Kubernetes."),
          az("Azure SQL", "Managed SQL Server."),
          az("Microsoft Entra ID", "Identity for people and workloads."),
        ],
      },
    ],
  },
];

export function roadmap(id: string) {
  return ROADMAPS.find((r) => r.id === id);
}
