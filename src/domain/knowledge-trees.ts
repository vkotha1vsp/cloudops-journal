/**
 * Default knowledge trees created for each new user. After creation they are ordinary
 * database rows: add, rename, nest or delete categories and topics from the UI.
 */
export type TreeSeed = { name: string; icon?: string; topics: string[]; children?: TreeSeed[] };

export const AWS_TREE: TreeSeed[] = [
  { name: "Compute", icon: "cpu", topics: ["EC2", "Auto Scaling", "Lambda", "ECS", "EKS"] },
  {
    name: "Networking",
    icon: "network",
    topics: ["VPC", "Subnets", "Route Tables", "NAT Gateway", "Internet Gateway", "Security Groups", "Network ACLs"],
  },
  {
    name: "Load Balancing",
    icon: "split",
    topics: ["Application Load Balancer", "Network Load Balancer", "Target Groups", "Health Checks"],
  },
  { name: "DNS and CDN", icon: "globe", topics: ["Route 53", "CloudFront", "AWS Certificate Manager"] },
  { name: "Storage", icon: "hard-drive", topics: ["S3", "EBS", "EFS"] },
  { name: "Databases", icon: "database", topics: ["RDS", "Aurora", "DynamoDB"] },
  { name: "Identity and Security", icon: "shield", topics: ["IAM", "KMS", "Secrets Manager", "WAF"] },
  { name: "CI/CD", icon: "git-branch", topics: ["CodePipeline", "CodeBuild", "ECR"] },
  { name: "Infrastructure as Code", icon: "file-code", topics: ["Terraform", "CloudFormation"] },
  {
    name: "Hybrid Networking",
    icon: "waypoints",
    topics: ["Transit Gateway", "Cloud WAN", "PrivateLink", "VPC Endpoints"],
  },
  { name: "Monitoring", icon: "activity", topics: ["CloudWatch", "CloudTrail", "AWS Config"] },
  { name: "Migration", icon: "truck", topics: ["DMS", "DataSync", "Migration Hub"] },
  { name: "Reliability", icon: "life-buoy", topics: ["Multi-AZ", "Multi-Region", "Route 53 Failover"] },
  { name: "Cost Optimization", icon: "piggy-bank", topics: ["Savings Plans", "Cost Explorer", "Rightsizing"] },
];

export const AZURE_TREE: TreeSeed[] = [
  { name: "Compute", icon: "cpu", topics: ["Virtual Machines", "Azure App Service", "Azure Functions"] },
  {
    name: "Networking",
    icon: "network",
    topics: ["Virtual Networks and Subnets", "Network Security Groups", "Azure Firewall", "Azure Private Link"],
  },
  {
    name: "Load Balancing and Delivery",
    icon: "split",
    topics: ["Azure Load Balancer", "Application Gateway", "Azure Front Door", "Azure DNS"],
  },
  { name: "Containers", icon: "box", topics: ["Azure Kubernetes Service", "Azure Container Registry"] },
  { name: "Storage and Data", icon: "database", topics: ["Azure Storage", "Azure SQL"] },
  { name: "Identity and Governance", icon: "shield", topics: ["Microsoft Entra ID", "Azure Policy"] },
  { name: "DevOps and Monitoring", icon: "activity", topics: ["Azure DevOps", "Azure Monitor"] },
  { name: "AI", icon: "sparkles", topics: ["Azure AI Services"] },
];

export const DEVOPS_TREE: TreeSeed[] = [
  { name: "Linux and Shell", icon: "terminal", topics: ["Processes and systemd", "Permissions", "Bash scripting"] },
  { name: "Networking Basics", icon: "network", topics: ["TCP/IP and ports", "DNS resolution", "TLS and certificates", "CIDR and subnetting"] },
  { name: "Version Control", icon: "git-branch", topics: ["Git branching", "Pull request workflow"] },
  { name: "Containers", icon: "box", topics: ["Docker images", "Docker networking", "Docker Compose"] },
  { name: "Kubernetes", icon: "boxes", topics: ["Pods and Deployments", "Services and Ingress", "ConfigMaps and Secrets", "Helm"] },
  { name: "CI/CD", icon: "workflow", topics: ["GitHub Actions", "Jenkins", "GitLab CI", "SonarQube"] },
  { name: "Infrastructure as Code", icon: "file-code", topics: ["Terraform state", "Terraform modules"] },
  { name: "Observability", icon: "activity", topics: ["Metrics", "Logs", "Tracing", "Alerting"] },
  { name: "Security", icon: "shield", topics: ["Secrets management", "Least privilege", "Supply-chain security"] },
];

export const TREES = { AWS: AWS_TREE, AZURE: AZURE_TREE, DEVOPS: DEVOPS_TREE } as const;
