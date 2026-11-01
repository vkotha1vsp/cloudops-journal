# Set up CloudOps Journal in the AWS Console (no Terraform)

Same result as `infra/ec2-terraform`, built by hand so you learn each service:

```
GitHub Actions (tests) → CodeBuild (pulls the commit from GitHub) → ECR (image) → EC2 (app + Postgres)
Internet → Route 53 → ALB (HTTPS, ACM certificate) → EC2 port 3000      Login: Cognito
```

**Before you start**
- Your domain must be in Route 53: **Route 53 → Hosted zones** should list it.
- Region: top-right of the console → **US East (N. Virginia) us-east-1**. Use it for every step.
- Your **Account ID**: click your name at the top right and copy the 12-digit number.
- Files you'll paste are in this repo under `infra/console/`. In each `iam/*.json` file, replace
  `<ACCOUNT_ID>` with your account ID and `<REGION>` with `us-east-1` (use your editor's Find and Replace).
- Keep a notes file open. You'll collect values (IDs, ARNs) along the way.

Names below are the ones the rest of the setup expects. Use them exactly.
Cost once everything is running: about **USD 45–50/month**.

---

## 1. ECR repository (where the built app image is stored)
**ECR → Private registry → Repositories → Create repository**
- Name: `cloudops-journal`
- Image tag mutability: **Mutable**
- Scan on push: on (if offered) → **Create**

📝 Note the **URI**: `<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/cloudops-journal`

## 2. Two S3 buckets
**S3 → Create bucket**, twice, with region us-east-1, **Block all public access** ticked, and encryption left at the default:

| Bucket name | Purpose | Extra setting after creating |
|---|---|---|
| `cloudops-journal-attachments-<ACCOUNT_ID>` | Files you attach to pages | Properties → **Bucket Versioning: Enable**; Permissions → CORS (below) |
| `cloudops-journal-backups-<ACCOUNT_ID>` | Nightly database backups | Management → lifecycle rule: expire objects after 30 days |

CORS for the attachments bucket (**Permissions → Cross-origin resource sharing (CORS) → Edit**). Use your own domain:
```json
[{ "AllowedMethods": ["PUT", "GET"], "AllowedOrigins": ["https://learn.example.com"],
   "AllowedHeaders": ["content-type", "content-length"], "MaxAgeSeconds": 3000 }]
```

## 3. Log group (where app logs go)
**CloudWatch → Logs → Log groups → Create log group**
- Name: `/ec2/cloudops-journal`, retention **1 month** → **Create**

## 4. Cognito (the login)
**Cognito → User pools → Create user pool**
1. Application type: **Traditional web application**. Name your application `cloudops-journal-web`.
2. Sign-in identifiers: **Email** only.
3. Self-registration: **off** (only you can log in).
4. Required attributes: **email**.
5. Return URL: `https://learn.example.com/api/auth/callback/cognito` → **Create user directory**.

Then, in the new user pool:
- **Overview:** 📝 note the **User pool ID** (looks like `us-east-1_AbC123xyz`).
- **App clients → cloudops-journal-web:**
  - 📝 note the **Client ID**, then click **Show client secret** and 📝 note the secret.
  - Open the **Login pages** tab (called "Managed login pages configuration" in some versions) → **Edit** and check:
    - Allowed callback URL: `https://learn.example.com/api/auth/callback/cognito`
    - Allowed sign-out URL: `https://learn.example.com/login`
    - OAuth grant type: **Authorization code grant**
    - Scopes: **openid**, **email**, **profile** → **Save**
- **Users → Create user:**
  - **Send an email invitation**, your email address, tick **Mark email address as verified**, **Generate a password** → **Create user**.
  - Cognito emails you a temporary password. Keep it.
- Optional: **Authentication methods → Password policy**: minimum length 14.

## 5. Secrets Manager (the app's passwords)
First generate two random values. In Git Bash or Terminal, run this twice and copy each result:
```bash
openssl rand -hex 24
```
**Secrets Manager → Store a new secret → Other type of secret → Key/value**, add three rows:

| Key | Value |
|---|---|
| `POSTGRES_PASSWORD` | first random value |
| `NEXTAUTH_SECRET` | second random value |
| `COGNITO_CLIENT_SECRET` | the client secret from step 4 |

Next → Secret name: `cloudops-journal/app` → Next (no rotation) → **Store**.

## 6. IAM: permissions

**6a. Server role (what the EC2 instance may do)**
1. **IAM → Policies → Create policy → JSON** → paste `infra/console/iam/1-ec2-instance-policy.json` (with your account ID filled in) → Next.
   Name it `cloudops-journal-ec2-policy` → **Create policy**.
2. **IAM → Roles → Create role**
   - Trusted entity: **AWS service**, use case **EC2** → Next.
   - Tick **AmazonSSMManagedInstanceCore** and **cloudops-journal-ec2-policy** → Next.
   - Role name: `cloudops-journal-ec2` → **Create role**.

**6b. Let GitHub sign in to AWS without passwords (OIDC)**
**IAM → Identity providers → Add provider** (skip if `token.actions.githubusercontent.com` is already listed):
- Provider type: **OpenID Connect**
- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com` → **Add provider**

**6c. GitHub deploy role**
**IAM → Roles → Create role**
1. Trusted entity: **Custom trust policy** → paste `iam/3-github-trust-policy.json` → Next.
2. Skip permissions for now → Next → Role name: `cloudops-journal-github-deploy` → **Create role**.
3. Open the role → **Add permissions → Create inline policy → JSON** → paste `iam/4-github-deploy-policy.json`.
   Name it `deploy` → **Create policy**.
4. 📝 Note the role **ARN**: `arn:aws:iam::<ACCOUNT_ID>:role/cloudops-journal-github-deploy`

## 7. Connect AWS to your GitHub repo, then create CodeBuild

**7a. GitHub connection (lets CodeBuild read your repo)**
**Developer Tools → Settings → Connections → Create connection** (search "Connections" in the top bar)
1. Provider: **GitHub** · Connection name: `cloudops-journal-github` → **Connect to GitHub**.
2. A GitHub window opens → **Authorize AWS Connector for GitHub**.
3. Back in AWS, under "App installation" click **Install a new app** → choose your account `vkotha1vsp`
   → **Only select repositories** → `cloudops-journal` → **Install**.
4. Click **Connect**. ✅ Status shows **Available**. 📝 Note the connection **ARN**.

**7b. CodeBuild project (builds the Docker image)**
**CodeBuild → Build projects → Create project**
- Project name: `cloudops-journal-image`
- **Source:**
  - Source provider: **GitHub**
  - Credential: **Use override credentials for this project only** (or default) → **Custom source credential** → choose `cloudops-journal-github`
  - Repository: **Repository in my GitHub account** → `vkotha1vsp/cloudops-journal`
  - Source version: `main`
  - **Primary source webhook events:** leave **"Rebuild every time a code change is pushed" UNticked**.
    GitHub Actions starts builds only after the tests pass.
- **Environment:**
  - Provisioning: On-demand · Environment image: **Managed image** · Compute: **EC2**
  - Operating system: **Amazon Linux** · Runtime: Standard · Image: `aws/codebuild/amazonlinux-x86_64-standard:5.0`
  - ✅ **Privileged** (required to build Docker images)
  - Service role: **New service role** (leave the suggested name)
  - **Additional configuration:**
    - Compute: **7 GB memory, 4 vCPUs**
    - Environment variable: Name `ECR_REPOSITORY_URI`, Value = the ECR URI from step 1
- **Buildspec:** Use a buildspec file (it's `buildspec.yml` in the repo)
- **Artifacts:** No artifacts
- **Logs:** CloudWatch logs on; leave the group name blank (it becomes `/aws/codebuild/cloudops-journal-image`)
- **Create build project**

**7c. Give CodeBuild permission to use the connection and push images:** **IAM → Roles** → search `codebuild-cloudops-journal-image` → open it
→ **Add permissions → Create inline policy → JSON** → paste `iam/2-codebuild-policy.json` → name it `ecr-push` → **Create**.

## 8. Security groups (firewalls)
**EC2 → Security Groups → Create security group**, both in the **default VPC**:

| Name | Inbound rules |
|---|---|
| `cloudops-alb-sg` | HTTP 80 from Anywhere-IPv4; HTTPS 443 from Anywhere-IPv4 |
| `cloudops-app-sg` | Custom TCP **3000**, Source = **cloudops-alb-sg** (choose the security group, not an IP) |

Leave outbound rules at the default (all traffic). Do **not** open port 22: you'll use Session Manager instead of SSH.

## 9. Launch the EC2 server
First open `infra/console/ec2-user-data.sh` in a text editor and edit the **6 values in the box** at the top:
your region, account ID, `learn.<your-domain>`, your email, and the User pool ID and Client ID from step 4.

**EC2 → Instances → Launch instances**
- **Name:** `cloudops-journal`. Click **Add additional tags** → Key `App`, Value `cloudops-journal`.
  This tag is what allows GitHub to deploy to the server.
- **AMI:** Amazon Linux 2023 (64-bit x86) · **Instance type:** `t3.small`
- **Key pair:** Proceed without a key pair
- **Network settings → Edit:**
  - VPC: default
  - Subnet: any (📝 note its Availability Zone)
  - Auto-assign public IP: **Enable** (outbound internet only; the firewall blocks inbound)
  - Select existing security group: `cloudops-app-sg`
- **Storage:** 30 GiB, gp3, open Advanced and set **Encrypted: Yes**
- **Advanced details:**
  - IAM instance profile: `cloudops-journal-ec2`
  - Termination protection: Enable
  - Metadata version: **V2 only (token required)**
  - Metadata response hop limit: **2** (lets the app container use the server's permissions)
  - User data: paste the whole edited `ec2-user-data.sh`
- **Launch instance** → 📝 note the **Instance ID** (`i-…`)

Check after about 5 minutes: select the instance → **Connect → Session Manager → Connect**, then run
```bash
sudo tail -3 /var/log/cloudops-setup.log
```
✅ Expected: `No image in ECR yet…` and `CloudOps setup finished`. The app gets installed in step 14.

## 10. HTTPS certificate (ACM)
**Certificate Manager → Request → Request a public certificate**
- Domain: `learn.example.com` · Validation: **DNS** → **Request**
- Open the certificate → **Create records in Route 53** → **Create records**
- Wait 2–10 minutes until the status shows **Issued**.

## 11. Target group (the list of servers the load balancer sends traffic to)
**EC2 → Target groups → Create target group**
- Target type: **Instances** · Name: `cloudops-journal-tg` · Protocol **HTTP**, port **3000** · VPC: default
- Health check path: `/api/health` → Next
- Tick your instance, port 3000 → **Include as pending below** → **Create target group**

It shows **unhealthy** until the first deploy. That's expected.

## 12. Application Load Balancer (the public front door)
**EC2 → Load balancers → Create → Application Load Balancer**
- Name: `cloudops-journal-alb` · Scheme: **Internet-facing** · IP type: IPv4
- Network mapping: default VPC; tick **at least two** Availability Zones, including your instance's AZ
- Security groups: remove `default`, select `cloudops-alb-sg`
- Listener: **HTTPS : 443** → forward to `cloudops-journal-tg`
  - Certificate: from ACM → `learn.example.com`
  - Security policy: `ELBSecurityPolicy-TLS13-1-2-2021-06`
- **Create load balancer**

Then add the HTTP redirect: open the load balancer → **Listeners → Add listener**
- **HTTP : 80** → action **Redirect to URL** → HTTPS, port 443, status code 301 → **Add**

## 13. DNS: point your name at the load balancer
**Route 53 → Hosted zones → your domain → Create record**
- Record name: `learn` · Type: **A** · **Alias: on**
- Route traffic to: Alias to Application and Classic Load Balancer → us-east-1 → `cloudops-journal-alb`
- **Create records**

## 14. Connect GitHub and deploy
In GitHub, open the repo → **Settings → Secrets and variables → Actions → Variables → New repository variable**:

| Name | Value |
|---|---|
| `AWS_REGION` | `us-east-1` |
| `EC2_DEPLOY_ROLE_ARN` | role ARN from step 6c |
| `CODEBUILD_PROJECT` | `cloudops-journal-image` |
| `EC2_INSTANCE_ID` | instance ID from step 9 |
| `APP_URL` | `https://learn.example.com` |

**Settings → Environments → New environment** → name it `production` → save.

**Actions → Build (CodeBuild) and deploy to EC2 → Run workflow (main).** About 15 minutes.

✅ Expected:
- Three green jobs: **ci → build → deploy**, with the deploy log ending in `✔ Deployed …` and `{"status":"ok","db":"ok"}`.
- In **EC2 → Target groups → cloudops-journal-tg → Targets**, the instance shows **healthy**.

## 15. Log in
Open `https://learn.example.com` → **Sign in with Amazon Cognito** → your email + the temporary password →
set a new password. You're in. 🎉

---

## Nice to add later
- **Backups of the whole disk:** EC2 → Lifecycle Manager → Create policy → target instances with tag
  `App = cloudops-journal`, daily, keep 7. (A nightly database dump to S3 is already set up by the user data.)
- **Alerts:** CloudWatch → Alarms → target group `UnHealthyHostCount > 0` → email yourself.
- **Moving to Terraform later:** you can import these resources or build fresh with `infra/ec2-terraform/`.

## If something fails
| Symptom | Fix |
|---|---|
| GitHub `build` job: "Not authorized to perform sts:AssumeRoleWithWebIdentity" | Check step 6b exists, the trust policy repo name is `vkotha1vsp/cloudops-journal`, and the environment is named exactly `production` |
| CodeBuild fails "denied: User … not authorized … ecr" | Step 7c's inline policy is missing, or still contains `<ACCOUNT_ID>` |
| CodeBuild fails in DOWNLOAD_SOURCE / "not authorized to use connection" | Step 7c's policy is missing, or the connection in 7a isn't **Available** |
| `deploy` job: "AccessDenied … ssm:SendCommand" | The instance is missing the tag `App = cloudops-journal` |
| `deploy` job: "InvalidInstanceId" | The instance isn't registered with Session Manager yet: check the IAM instance profile from step 9, wait 3 minutes, re-run |
| Deploy rolls back / health check fails | CloudWatch → `/ec2/cloudops-journal` → stream `app`. Usually a typo in the user data values or the secret names |
| Cognito says "redirect_mismatch" | The callback URL in step 4 doesn't exactly match `https://learn.<domain>/api/auth/callback/cognito` |
| Browser shows 503 | Target group has no healthy target: run the deploy (step 14) or check the `app` logs |
