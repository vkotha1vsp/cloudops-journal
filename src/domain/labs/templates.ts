/**
 * Starter lab templates (Section 10). Kept in code so they stay versioned with the app;
 * "Start lab" copies one into the database where it becomes fully editable.
 */
export type LabTemplateStep = { title: string; instruction: string; commands?: string; expected?: string };
export type LabTemplate = {
  id: string;
  title: string;
  track: "aws" | "devops";
  topics: string[];
  conceptId?: string;
  objective: string;
  prerequisites: string;
  estimatedCost: string;
  expectedResults: string;
  steps: LabTemplateStep[];
  checklist: string[];
  cleanup: string;
  terraform?: string;
};

export const LAB_TEMPLATES: LabTemplate[] = [
  {
    id: "ec2-nginx",
    title: "Public EC2 website with Nginx",
    track: "aws",
    topics: ["EC2", "Security Groups", "VPC"],
    objective: "Launch an EC2 instance in a public subnet, install Nginx and reach it from a browser over HTTP.",
    prerequisites: "AWS account with a VPC that has a public subnet (route 0.0.0.0/0 → Internet Gateway). AWS CLI configured.",
    estimatedCost: "Free tier eligible (t3.micro). Otherwise ≈ $0.01/hour.",
    expectedResults: "http://<public-ip> shows the Nginx welcome page. Port 22 is not open to the internet.",
    steps: [
      { title: "Create a security group", instruction: "Allow HTTP (80) from anywhere. Do not open SSH; use Session Manager instead.", commands: "aws ec2 create-security-group --group-name web-sg --description \"web\" --vpc-id <vpc-id>\naws ec2 authorize-security-group-ingress --group-id <sg-id> --protocol tcp --port 80 --cidr 0.0.0.0/0", expected: "A GroupId like sg-0abc…" },
      { title: "Launch the instance", instruction: "Amazon Linux 2023, t3.micro, public subnet, auto-assign public IP, the SG above, and an instance profile with AmazonSSMManagedInstanceCore. Add user data to install Nginx.", commands: "#!/bin/bash\ndnf install -y nginx\nsystemctl enable --now nginx", expected: "Instance state running, 2/2 status checks passed." },
      { title: "Test from your browser", instruction: "Open the public IPv4 address with http://.", commands: "curl -I http://<public-ip>", expected: "HTTP/1.1 200 OK, Server: nginx" },
      { title: "Inspect from inside", instruction: "Connect with Session Manager and check the service and logs.", commands: "systemctl status nginx\nsudo tail -n 20 /var/log/nginx/access.log", expected: "active (running); your request appears in access.log" },
    ],
    checklist: ["Page loads over HTTP", "Port 22 not open to 0.0.0.0/0", "Instance reachable via Session Manager", "Access log shows requests"],
    cleanup: "Terminate the instance, then delete the security group (it can't be deleted while attached).",
  },
  {
    id: "alb-target-groups",
    title: "ALB and target groups",
    track: "aws",
    topics: ["ALB", "Target Groups", "Health Checks"],
    conceptId: "alb-web-app",
    objective: "Put two EC2 web servers in two AZs behind an Application Load Balancer and watch health checks take an instance out of service.",
    prerequisites: "Two public subnets in different AZs (for the ALB) and two private or public subnets for instances. Lab 1 user data.",
    estimatedCost: "ALB ≈ $0.0225/hour + LCU; 2× t3.micro. About $1 for a 2-hour lab.",
    expectedResults: "Refreshing the ALB DNS name alternates between instances. Stopping Nginx on one marks it unhealthy and traffic shifts.",
    steps: [
      { title: "Security groups", instruction: "alb-sg allows 80/443 from 0.0.0.0/0. web-sg allows 80 only from alb-sg (reference the SG, not a CIDR)." },
      { title: "Launch two instances", instruction: "One per AZ, web-sg attached. Make each page print its hostname so you can see which one answered.", commands: "echo \"<h1>$(hostname)</h1>\" | sudo tee /usr/share/nginx/html/index.html" },
      { title: "Create the target group", instruction: "Type instance, HTTP:80, health check path /, healthy threshold 2, interval 10s. Register both instances.", commands: "aws elbv2 describe-target-health --target-group-arn <tg-arn>", expected: "Both targets healthy after ~30s" },
      { title: "Create the ALB", instruction: "Internet-facing, both public subnets, alb-sg. Listener HTTP:80 → forward to the target group.", commands: "for i in $(seq 6); do curl -s http://<alb-dns>; done", expected: "Responses alternate between the two hostnames" },
      { title: "Break one target", instruction: "Stop Nginx on instance A and watch the target group.", commands: "sudo systemctl stop nginx\naws elbv2 describe-target-health --target-group-arn <tg-arn> --query 'TargetHealthDescriptions[].TargetHealth'", expected: "Instance A: unhealthy (Target.ResponseCodeMismatch or Target.Timeout); all requests go to B" },
    ],
    checklist: ["Both targets healthy", "Instances not reachable directly from the internet", "Unhealthy target removed from rotation", "Recovered after Nginx restart"],
    cleanup: "Delete the ALB, then the target group, then terminate instances and delete SGs (alb-sg last).",
  },
  {
    id: "ssm-private-ec2",
    title: "Private EC2 access through Session Manager",
    track: "aws",
    topics: ["Systems Manager", "VPC Endpoints", "IAM"],
    conceptId: "vpc-endpoint",
    objective: "Reach a shell on an instance with no public IP, no SSH key and no inbound rules.",
    prerequisites: "A private subnet. Either a NAT gateway or the three SSM interface endpoints.",
    estimatedCost: "3 interface endpoints ≈ $0.03/hour total (per AZ). NAT gateway ≈ $0.045/hour + data.",
    expectedResults: "aws ssm start-session opens a shell. The instance's SG has zero inbound rules.",
    steps: [
      { title: "Instance profile", instruction: "Create a role for EC2 with AmazonSSMManagedInstanceCore and attach it to the instance." },
      { title: "Give the agent a path out", instruction: "Create interface endpoints com.amazonaws.<region>.ssm, ssmmessages and ec2messages in the private subnet, private DNS enabled. Endpoint SG allows 443 from the VPC CIDR." },
      { title: "Verify registration", instruction: "The instance should appear as Online within a few minutes.", commands: "aws ssm describe-instance-information --query 'InstanceInformationList[].[InstanceId,PingStatus]'", expected: "Online" },
      { title: "Start a session", instruction: "Use the console Connect button or the CLI (needs the Session Manager plugin).", commands: "aws ssm start-session --target <instance-id>", expected: "sh-5.2$ prompt" },
    ],
    checklist: ["No public IP", "No inbound SG rules", "Session works", "Session logged in CloudTrail (StartSession)"],
    cleanup: "Terminate the instance, delete the three endpoints and their SG, and the IAM role if unused.",
  },
  {
    id: "route53-acm",
    title: "Route 53 and ACM",
    track: "aws",
    topics: ["Route 53", "ACM", "ALB"],
    objective: "Serve an ALB on your own subdomain over HTTPS with a free ACM certificate validated by DNS.",
    prerequisites: "A Route 53 public hosted zone for a domain you own and an ALB from the previous lab.",
    estimatedCost: "Hosted zone $0.50/month; ACM public certificates are free.",
    expectedResults: "https://app.<domain> loads with a valid certificate; http redirects to https.",
    steps: [
      { title: "Request the certificate", instruction: "ACM in the ALB's region → request public certificate for app.<domain> → DNS validation → Create records in Route 53.", commands: "aws acm describe-certificate --certificate-arn <arn> --query Certificate.Status", expected: "ISSUED (usually within minutes)" },
      { title: "HTTPS listener", instruction: "Add listener HTTPS:443 with the certificate, forwarding to the target group. Change HTTP:80 to redirect to HTTPS (301)." },
      { title: "Alias record", instruction: "Create an A record app.<domain>, Alias = yes, target = the ALB.", commands: "dig +short app.<domain>", expected: "The ALB's IP addresses" },
      { title: "Test", instruction: "Check the redirect and the certificate chain.", commands: "curl -I http://app.<domain>\ncurl -vI https://app.<domain> 2>&1 | grep -E 'subject|issuer|HTTP/'", expected: "301 → https; issuer Amazon; HTTP/2 200" },
    ],
    checklist: ["Certificate ISSUED", "Alias record resolves", "HTTP redirects to HTTPS", "Browser shows valid lock"],
    cleanup: "Delete the alias record and HTTPS listener. Delete the certificate once nothing uses it. Keep the hosted zone if you use the domain.",
  },
  {
    id: "cloudfront-s3",
    title: "CloudFront distribution",
    track: "aws",
    topics: ["CloudFront", "S3", "ACM"],
    conceptId: "static-site",
    objective: "Serve a private S3 bucket through CloudFront using Origin Access Control.",
    prerequisites: "An S3 bucket with Block Public Access ON and an index.html object.",
    estimatedCost: "Pennies for a lab (free tier: 1 TB transfer / 10M requests per month).",
    expectedResults: "The CloudFront URL serves the page; the S3 object URL returns 403.",
    steps: [
      { title: "Create the distribution", instruction: "Origin = the bucket (REST endpoint, not website endpoint). Origin access: Origin Access Control. Default root object index.html. Viewer protocol: redirect HTTP to HTTPS." },
      { title: "Apply the bucket policy", instruction: "Copy the policy CloudFront offers; it allows s3:GetObject only for this distribution (aws:SourceArn)." },
      { title: "Test both paths", instruction: "", commands: "curl -I https://<id>.cloudfront.net/\ncurl -I https://<bucket>.s3.amazonaws.com/index.html", expected: "200 with x-cache header; direct S3 returns 403" },
      { title: "Invalidate after a change", instruction: "Upload a new index.html, then invalidate.", commands: "aws cloudfront create-invalidation --distribution-id <id> --paths '/*'" },
    ],
    checklist: ["Bucket still private", "CloudFront returns 200", "Direct S3 returns 403", "HTTPS enforced"],
    cleanup: "Disable then delete the distribution (disabling takes several minutes), then empty and delete the bucket.",
  },
  {
    id: "jenkins-ecr",
    title: "Jenkins pipeline to Amazon ECR",
    track: "devops",
    topics: ["Jenkins", "ECR", "Docker"],
    conceptId: "ci-pipeline",
    objective: "Build a Docker image in a Jenkins pipeline and push it to ECR using an instance role (no static keys).",
    prerequisites: "Jenkins on EC2 with Docker installed and the jenkins user in the docker group. An ECR repository.",
    estimatedCost: "EC2 for Jenkins (t3.medium ≈ $0.04/hour); ECR storage $0.10/GB-month.",
    expectedResults: "Each build pushes <repo>:<build-number> to ECR.",
    steps: [
      { title: "IAM for the Jenkins instance", instruction: "Instance role with ecr:GetAuthorizationToken (resource *) and push actions (ecr:BatchCheckLayerAvailability, InitiateLayerUpload, UploadLayerPart, CompleteLayerUpload, PutImage) on the one repository." },
      { title: "Jenkinsfile", instruction: "Add this to the repo root.", commands: "pipeline {\n  agent any\n  environment { REPO = '<acct>.dkr.ecr.<region>.amazonaws.com/<name>' }\n  stages {\n    stage('Build') { steps { sh 'docker build -t $REPO:$BUILD_NUMBER .' } }\n    stage('Push') { steps { sh '''\n      aws ecr get-login-password | docker login --username AWS --password-stdin ${REPO%%/*}\n      docker push $REPO:$BUILD_NUMBER\n    ''' } }\n  }\n}" },
      { title: "Run and verify", instruction: "Create a Pipeline job from SCM, run it.", commands: "aws ecr describe-images --repository-name <name> --query 'imageDetails[].imageTags'", expected: "The build number appears as a tag" },
    ],
    checklist: ["No AWS keys stored in Jenkins", "Image pushed with build tag", "Scan on push enabled"],
    cleanup: "Delete test images (or set a lifecycle policy). Stop the Jenkins instance when idle.",
  },
  {
    id: "eks-deploy",
    title: "EKS application deployment",
    track: "aws",
    topics: ["EKS", "Kubernetes", "ALB"],
    objective: "Create an EKS cluster, deploy an app and expose it with the AWS Load Balancer Controller.",
    prerequisites: "eksctl, kubectl and helm installed. Permissions to create EKS, IAM and VPC resources.",
    estimatedCost: "Control plane $0.10/hour + 2× t3.medium nodes + ALB. Roughly $0.25/hour — delete the same day.",
    expectedResults: "An Ingress creates an ALB whose DNS name serves the app.",
    steps: [
      { title: "Create the cluster", instruction: "", commands: "eksctl create cluster --name lab --region <region> --nodes 2 --node-type t3.medium --with-oidc", expected: "~15 minutes; kubectl get nodes shows 2 Ready" },
      { title: "Install the AWS Load Balancer Controller", instruction: "Create the IAM policy and service account (IRSA), then install the Helm chart.", commands: "helm repo add eks https://aws.github.io/eks-charts\nhelm install aws-load-balancer-controller eks/aws-load-balancer-controller -n kube-system --set clusterName=lab --set serviceAccount.create=false --set serviceAccount.name=aws-load-balancer-controller" },
      { title: "Deploy the app", instruction: "", commands: "kubectl create deployment web --image=nginx --replicas=2\nkubectl expose deployment web --port=80" },
      { title: "Ingress", instruction: "Create an Ingress with ingressClassName alb, annotations alb.ingress.kubernetes.io/scheme: internet-facing and target-type: ip.", commands: "kubectl get ingress web -w", expected: "ADDRESS shows an ALB hostname" },
    ],
    checklist: ["Nodes Ready", "Controller pods running", "Ingress has an address", "App reachable"],
    cleanup: "kubectl delete ingress web (removes the ALB) BEFORE eksctl delete cluster --name lab, otherwise the ALB is orphaned.",
  },
  {
    id: "cloud-wan",
    title: "Cloud WAN cross-account connectivity",
    track: "aws",
    topics: ["Cloud WAN", "Transit Gateway", "RAM"],
    objective: "Connect VPCs in two accounts through an AWS Cloud WAN core network with segment-based routing.",
    prerequisites: "Two accounts in one AWS Organization; RAM sharing with Organizations enabled; non-overlapping VPC CIDRs.",
    estimatedCost: "Core network edge ≈ $0.50/hour per edge location plus attachment and data charges. Plan a short lab.",
    expectedResults: "An instance in account A can reach an instance in account B on its private IP.",
    steps: [
      { title: "Global network and core network", instruction: "Network Manager → create a global network and core network with a policy defining one edge location and a segment (e.g. dev) with require-attachment-acceptance false." },
      { title: "Share with RAM", instruction: "Share the core network with account B via AWS RAM." },
      { title: "Attach VPCs", instruction: "In each account create a VPC attachment to the core network, tagged so the policy's attachment policy maps it to the dev segment." },
      { title: "Routes and security groups", instruction: "In each VPC route the other CIDR to the core network. Allow ICMP/the test port from the other CIDR in SGs.", commands: "ping <private-ip-in-other-account>", expected: "Replies" },
    ],
    checklist: ["Both attachments AVAILABLE in the segment", "Routes present in both VPC route tables", "Ping succeeds"],
    cleanup: "Delete VPC attachments, then the core network, then the global network. Remove the RAM share.",
  },
  {
    id: "route53-failover",
    title: "Route 53 regional failover",
    track: "aws",
    topics: ["Route 53", "Health Checks", "Multi-Region"],
    conceptId: "route53-failover",
    objective: "Fail a hostname over from a primary to a secondary region when a health check fails.",
    prerequisites: "The same app behind a load balancer in two regions. A public hosted zone.",
    estimatedCost: "Two stacks for the duration + health check $0.50/month (AWS endpoint).",
    expectedResults: "When the primary stops answering, DNS answers switch to the secondary within ~TTL + 3 failed checks.",
    steps: [
      { title: "Health check", instruction: "Create an HTTPS health check on the primary's /health path (interval 30s, threshold 3)." },
      { title: "Failover records", instruction: "Two A alias records with the same name: Primary (with the health check) → region 1 ALB; Secondary → region 2 ALB. TTL 60 (alias records use the target's TTL)." },
      { title: "Fail the primary", instruction: "Scale the primary targets to zero or block the health check path, then watch DNS.", commands: "watch -n 10 dig +short app.<domain>", expected: "Answers change to the secondary's IPs" },
      { title: "Fail back", instruction: "Restore the primary; once healthy, answers return to it." },
    ],
    checklist: ["Health check turns Unhealthy", "DNS answers switch", "Clients with cached answers recover after TTL", "Fail back works"],
    cleanup: "Delete the failover records and health check, then tear down the secondary stack.",
  },
  {
    id: "sonarqube-ci",
    title: "SonarQube integration in CI/CD",
    track: "devops",
    topics: ["SonarQube", "CI/CD", "Jenkins"],
    objective: "Add static analysis with a quality gate that fails the pipeline on new issues.",
    prerequisites: "A SonarQube server (Docker is fine for a lab) and a CI pipeline (Jenkins or GitHub Actions).",
    estimatedCost: "Runs on the Jenkins host or a t3.medium (SonarQube needs ~2 GB RAM).",
    expectedResults: "A pull request that adds a bug fails the Quality Gate stage.",
    steps: [
      { title: "Run SonarQube", instruction: "", commands: "docker run -d --name sonarqube -p 9000:9000 sonarqube:lts-community", expected: "UI at http://<host>:9000 (change the admin password)" },
      { title: "Project and token", instruction: "Create a project, generate a token and store it as a CI secret (never in the repo)." },
      { title: "Scanner stage", instruction: "Jenkins: withSonarQubeEnv('sonar') { sh 'sonar-scanner -Dsonar.projectKey=<key>' } then waitForQualityGate abortPipeline: true." },
      { title: "Prove the gate", instruction: "Commit code with an obvious issue and confirm the pipeline stops.", expected: "Quality Gate: FAILED and the build is red" },
    ],
    checklist: ["Token stored as a secret", "Analysis appears in SonarQube", "Gate blocks a bad change", "Webhook to Jenkins configured"],
    cleanup: "docker rm -f sonarqube and remove the project token.",
  },
];

export function labTemplate(id: string) {
  return LAB_TEMPLATES.find((t) => t.id === id);
}
