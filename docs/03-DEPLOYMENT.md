# Deploying CloudOps Journal to AWS

Two options, both in your own AWS account, both on your existing domain (no transfer needed):

| | Option B: production (recommended) | Option A: low cost |
|---|---|---|
| Compute | ECS Fargate behind an ALB | One Ubuntu EC2 with Docker Compose |
| Database | RDS PostgreSQL 16, encrypted, automated backups | PostgreSQL container on the instance's disk |
| TLS | ACM certificate on the ALB | Caddy + Let's Encrypt |
| Auth | Cognito (created by Terraform) | Cognito (created with the CLI below) |
| Deploys | GitHub Actions (OIDC, no stored keys) | `git pull && docker compose up -d --build` |
| Rough cost* | ≈ USD 80/month (≈ 47 with `nat_gateway = "none"`) | ≈ USD 17/month (t4g.small) |

\*Rough us-east-1 on-demand estimates for one task and a db.t4g.micro: ALB ≈ 18, Fargate 0.5 vCPU/1 GB ≈ 18,
RDS ≈ 14, NAT gateway ≈ 33 plus data, public IPv4 addresses ≈ 4 each, plus small amounts for Secrets Manager,
CloudWatch and S3. Prices change; check the [AWS Pricing Calculator](https://calculator.aws/) before relying on them.

> **Nothing is created in your account until you run `terraform apply` yourself and confirm the plan.**
> The app never creates infrastructure on its own.

---

## Option B: ECS Fargate with Terraform

### What gets created

```
Route 53 (your zone) ── A alias ──▶ ALB (public subnets, 2 AZs, TLS 1.3 policy, :80 → :443 redirect)
                                     │  listener :443 → default rule → target group (ip, :3000, GET /api/health)
                                     ▼
                         ECS Fargate service (app subnets, SG: 3000 from ALB SG only)
                                     │                         │
                         RDS PostgreSQL 16                S3 attachments bucket
                         (db subnets, no internet          (private, SSE, versioned,
                          route, SG: 5432 from app)          presigned URLs only)

Cognito user pool (admin-only sign-up, optional TOTP MFA) · Secrets Manager · ECR (immutable tags, scan on push)
CloudWatch logs + alarms → SNS email · GitHub OIDC deploy role scoped to your repo and branch
```

### Prerequisites

- An AWS account and a **public Route 53 hosted zone** for your domain (for example `example.com`).
  If your domain is registered elsewhere, you only need its NS records pointing at the Route 53 zone.
- Terraform ≥ 1.6 (or OpenTofu), AWS CLI v2 signed in with an admin-capable profile, Docker with buildx, `jq`.
- The code pushed to a GitHub repository (for automated deploys).

### 1. Remote state bucket (once)

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET=cloudops-journal-tfstate-$ACCOUNT
aws s3api create-bucket --bucket $BUCKET --region us-east-1
aws s3api put-bucket-versioning --bucket $BUCKET --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket $BUCKET \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-public-access-block --bucket $BUCKET \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

State contains the generated database password and app secrets, which is why the bucket must stay private and encrypted.

### 2. Configure

```bash
cd infra/terraform
cp backend.hcl.example backend.hcl          # set bucket name
cp terraform.tfvars.example terraform.tfvars # set hosted_zone_name, app_subdomain, admin_email, github_repository
terraform init -backend-config=backend.hcl
```

### 3. Review and apply

```bash
terraform plan -out tfplan     # read it: about 75 resources, named cloudops-journal-prod-*
terraform apply tfplan         # ≈ 10–15 minutes (RDS and certificate validation are the slow parts)
```

Expected: `Apply complete!` and outputs including `app_url` and `github_actions_variables`.
Cognito emails `admin_email` a temporary password. If you set `alarm_email`, confirm the SNS subscription email.

At this point the ECS service exists but has no image yet, so its tasks fail to start. That is expected;
the first deploy (next step) fixes it.

### 4. First deploy

**With GitHub Actions (recommended):**

```bash
terraform output -json github_actions_variables
```

In GitHub → *Settings → Secrets and variables → Actions → Variables*, add each key/value shown
(`AWS_REGION`, `AWS_DEPLOY_ROLE_ARN`, `ECR_REPOSITORY`, `ECS_CLUSTER`, `ECS_SERVICE`, `APP_TASK_FAMILY`,
`MIGRATE_TASK_FAMILY`, `TASK_SUBNETS`, `TASK_SECURITY_GROUP`, `ASSIGN_PUBLIC_IP`, `APP_URL`).
Create an environment named **production** (*Settings → Environments*); add yourself as a required reviewer if
you want to approve each deploy. Then push to `main` or run **Deploy to AWS** manually.

The workflow: CI (typecheck, lint, tests, build, smoke test, Terraform validate) → build and push both images
→ run `prisma migrate deploy` as a one-off ECS task → roll the service → check `https://<app>/api/health`.

**Or from your machine:** `./scripts/deploy-manual.sh` does the same steps using your local AWS credentials.

### 5. Sign in (Scenario H)

Open `app_url`, click **Sign in with Amazon Cognito**, use `admin_email` and the emailed temporary password,
then set a permanent one. Your workspace and the AWS, Azure and DevOps knowledge trees are created on first sign-in.

Optional: add sample pages with `DATABASE_URL=… SEED_ADMIN_EMAIL=you@example.com npm run db:seed`, which requires
network access to the database. The simplest route is to skip it in production and write your own pages.

### Verify

```bash
curl -s https://learn.example.com/api/health          # {"status":"ok","db":"ok",…}
curl -sI http://learn.example.com | head -1            # HTTP/1.1 301 → https
curl -s -o /dev/null -w '%{http_code}\n' https://learn.example.com/api/pages   # 401 when signed out
PUBLIC_ONLY=1 BASE=https://learn.example.com ./scripts/smoke-test.sh
```

### Troubleshooting the deploy

| Symptom | Where to look | Usual cause |
|---|---|---|
| Certificate stuck "Pending validation" | ACM console | The hosted zone is not authoritative for the domain (check NS records at your registrar) |
| Target group shows `unhealthy`, reason `Target.Timeout` | EC2 → Target groups | Tasks cannot reach RDS (check `db` SG), or app crashed on start: CloudWatch `/ecs/cloudops-journal-prod` |
| `Invalid environment configuration` in logs | CloudWatch logs | A required variable is missing in the task definition |
| `self-signed certificate in certificate chain` | CloudWatch logs | Image built without the RDS CA bundle; rebuild with the provided Dockerfile |
| Migration task exit code ≠ 0 | CloudWatch, stream prefix `migrate` | Failing migration; the app is not rolled out, so fix the migration and redeploy |
| Cognito "redirect_mismatch" | Browser | `app_subdomain`/`hosted_zone_name` changed after the client was created; re-apply Terraform |
| `AccessDenied` on sign-in page | App | Signed in with an email that is not `admin_email` |

### Scaling beyond one task

`desired_count = 1` by default. The API rate limiter is in-memory, so with several tasks each enforces its own
limit (more permissive, not broken). Sessions are stateless JWTs, so multiple tasks otherwise work as-is.

---

## Option A: single EC2 with Docker Compose

1. **Launch** an Ubuntu 24.04 instance (t4g.small is enough), 20 GB gp3, in a public subnet with an Elastic IP.
   Security group: inbound 80 and 443 from anywhere; no SSH needed if you use Session Manager
   (attach the `AmazonSSMManagedInstanceCore` policy to the instance role).
2. **DNS:** in your Route 53 zone, create an `A` record `learn.example.com` → the Elastic IP.
3. **Cognito:** create a user pool and app client once:
   ```bash
   POOL=$(aws cognito-idp create-user-pool --pool-name cloudops-journal --username-attributes email \
     --auto-verified-attributes email --admin-create-user-config AllowAdminCreateUserOnly=true \
     --query UserPool.Id --output text)
   aws cognito-idp create-user-pool-domain --user-pool-id $POOL --domain cloudops-journal-$RANDOM
   aws cognito-idp create-user-pool-client --user-pool-id $POOL --client-name web --generate-secret \
     --allowed-o-auth-flows code --allowed-o-auth-scopes openid email profile \
     --allowed-o-auth-flows-user-pool-client --supported-identity-providers COGNITO \
     --callback-urls https://learn.example.com/api/auth/callback/cognito \
     --logout-urls https://learn.example.com/login
   aws cognito-idp admin-create-user --user-pool-id $POOL --username you@example.com \
     --user-attributes Name=email,Value=you@example.com Name=email_verified,Value=true
   ```
   Note the client ID and secret from the client output. Issuer: `https://cognito-idp.<region>.amazonaws.com/$POOL`.
4. **S3 (optional, for attachments and backups):** create a private bucket; give the instance role
   `s3:PutObject`/`GetObject` on `arn:aws:s3:::<bucket>/users/*` and `arn:aws:s3:::<bucket>/postgres/*`.
5. **Install and start:**
   ```bash
   git clone https://github.com/<you>/cloudops-journal.git && cd cloudops-journal
   ./infra/ec2-compose/setup-ubuntu.sh && exit   # log back in for the docker group
   cd cloudops-journal && cp infra/ec2-compose/.env.example infra/ec2-compose/.env && chmod 600 infra/ec2-compose/.env
   # edit .env, then:
   docker compose -f infra/ec2-compose/docker-compose.prod.yml --env-file infra/ec2-compose/.env up -d --build
   ```
   Caddy obtains the certificate on first request. Expected: `https://learn.example.com/api/health` returns `ok`.
6. **Backups:** add the cron line from `infra/ec2-compose/backup.sh`. Also enable EBS snapshots with
   Amazon Data Lifecycle Manager.
7. **Update:** `git pull && docker compose -f infra/ec2-compose/docker-compose.prod.yml --env-file infra/ec2-compose/.env up -d --build`
   (migrations run automatically before the app starts).
