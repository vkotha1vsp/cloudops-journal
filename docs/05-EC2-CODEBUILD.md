# Deploy to EC2 with GitHub Actions + AWS CodeBuild

This is the path set up for `vkotha1vsp/cloudops-journal`. On every push to `main`:

```
GitHub Actions ──CI (tests, build, smoke test)──▶ starts CodeBuild for that commit
      │
      └─▶ AWS CodeBuild pulls the commit from GitHub (CodeConnections) ──docker build──▶ Amazon ECR  (tags: <sha>, latest)
                                                              │
      └─▶ SSM Run Command on EC2: /opt/cloudops/deploy.sh <sha>
             pull image → prisma migrate deploy → restart app → health check (auto-rollback on failure)

Internet ──HTTPS──▶ Route 53 (learn.<your-domain>) ─▶ ALB + ACM certificate ─▶ EC2 :3000 (only from ALB)
                                                                               ├─ app container
                                                                               └─ Postgres container (not exposed)
Sign-in: Amazon Cognito (your email only, temporary password emailed, optional MFA)
```

> Terminology: **ECR** stores Docker images. **ACM** issues the HTTPS certificate. Both are used here.

Terraform lives in `infra/ec2-terraform/` (separate from the ECS option in `infra/terraform/`).
Nothing is created in AWS until you run `terraform apply` and confirm.

**Rough cost** (us-east-1): t3.small ≈ 15, ALB ≈ 18, public IPv4 addresses ≈ 11, EBS 30 GB + snapshots ≈ 4,
CodeBuild ≈ 0.10 per build, Secrets Manager/CloudWatch/S3 ≈ 2 → **≈ USD 50/month**. Check the AWS Pricing
Calculator for current prices.

---

## 1. Push the code to GitHub

```bash
unzip cloudops-journal.zip && cd cloudops-journal
git remote add origin https://github.com/vkotha1vsp/cloudops-journal.git
git push -u origin main
```

If GitHub created the repo with a README and the push is rejected, either delete that README commit
(`git push -u origin main --force`, only if the repo has nothing else you need) or merge it:
`git pull origin main --allow-unrelated-histories --no-edit && git push -u origin main`.

The first push runs CI only for this commit; the deploy job fails until steps 2–4 are done. That is expected.

## 2. Terraform state bucket (once)

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET=cloudops-journal-tfstate-$ACCOUNT
aws s3api create-bucket --bucket $BUCKET --region us-east-1
aws s3api put-bucket-versioning --bucket $BUCKET --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket $BUCKET \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

## 3. Create the AWS infrastructure

```bash
cd infra/ec2-terraform
cp backend.hcl.example backend.hcl            # put your bucket name in it
cp terraform.tfvars.example terraform.tfvars  # set hosted_zone_name, app_subdomain, admin_email
terraform init -backend-config=backend.hcl
terraform plan -out tfplan                    # review: about 70 resources named cloudops-journal-ec2-*
terraform apply tfplan                        # ~5–10 min (certificate validation is the slow part)
```

Notes:
- `hosted_zone_name` must be a **public Route 53 hosted zone** you already own. Your domain is not transferred.
- If your account already has a GitHub OIDC provider, add `create_github_oidc_provider = false`.
- Cognito emails `admin_email` a temporary password (valid 7 days).

What it creates: VPC with two public subnets, ALB with HTTP→HTTPS redirect and a TLS 1.3 policy, ACM certificate
(DNS-validated in your zone), `A` record for the app, EC2 (Amazon Linux 2023, IMDSv2, encrypted disk, no SSH;
inbound only port 3000 from the ALB), ECR repository, CodeBuild project, a GitHub connection (CodeConnections), S3 buckets (attachments,
backups), Cognito user pool + your user, Secrets Manager secret, CloudWatch logs and alarms, daily EBS snapshots,
nightly `pg_dump` to S3, and an IAM role GitHub can assume via OIDC (only from this repo's `main` branch).

## 4. Connect GitHub to AWS

**4a. Approve the GitHub connection (once).** Terraform creates it as *Pending*. In the console:
**Developer Tools → Settings → Connections** → `cloudops-journal-ec2-github` → **Update pending connection**
→ authorize **AWS Connector for GitHub** → install it on `vkotha1vsp/cloudops-journal` → **Connect**.
Status must show **Available**.

**4b. Repository variables**

```bash
terraform output -json github_actions_variables
```

In GitHub → **Settings → Secrets and variables → Actions → Variables → New repository variable**, add each one:
`AWS_REGION`, `EC2_DEPLOY_ROLE_ARN`, `CODEBUILD_PROJECT`, `EC2_INSTANCE_ID`, `APP_URL`.
(These are identifiers, not secrets. No AWS keys go into GitHub.)

Then **Settings → Environments → New environment → `production`**. Optionally add yourself as a
required reviewer to approve each deploy.

## 5. Deploy

GitHub → **Actions → "Build (CodeBuild) and deploy to EC2" → Run workflow** (or push any commit to `main`).

Expected run (≈ 10–15 min the first time):
1. `ci`: typecheck, lint, 64 tests, build, 42-check smoke test, Terraform validation
2. `build`: prints the CodeBuild console link, then `SUCCEEDED`
3. `deploy`: prints `✔ Deployed <sha>`, then `{"status":"ok","db":"ok",…}` from your public URL

## 6. Sign in

Open `https://learn.<your-domain>` → **Sign in with Amazon Cognito** → your email + the emailed temporary
password → choose a permanent password (14+ characters). Optionally enable an authenticator app (MFA)
from the Cognito hosted page. Any other email is refused even if it exists in Cognito.

To add a second allowed person later: add their email to `ALLOWED_EMAILS` in
`/opt/cloudops/config.env` on the instance and create their Cognito user
(`aws cognito-idp admin-create-user --user-pool-id <id> --username them@example.com`), then redeploy.

---

## Operating it

| Task | How |
|---|---|
| Shell on the server | `aws ssm start-session --target <instance-id>` (Session Manager; no SSH or open ports) |
| App logs | CloudWatch Logs → `/ec2/cloudops-journal-ec2` → streams `app`, `db`, `migrate` |
| Build logs | CloudWatch Logs → `/codebuild/cloudops-journal-ec2`, or the CodeBuild console |
| Redeploy a specific version | `sudo /opt/cloudops/deploy.sh <git-sha>` on the instance, or re-run an older workflow |
| First-boot log | `/var/log/cloudops-setup.log` |
| Backups | Nightly `pg_dump` → `s3://cloudops-journal-ec2-backups-<account>/postgres/` (kept 30 days) + daily EBS snapshots (kept 7) |
| Manual backup | `sudo systemctl start cloudops-backup.service` |
| Restore a dump | `aws s3 cp s3://…/postgres/<file>.dump /tmp/r.dump && sudo docker compose -f /opt/cloudops/compose.yml exec -T db pg_restore -U cloudops -d cloudops --clean --if-exists < /tmp/r.dump` |
| Alarms | Unhealthy app, high CPU, and EC2 system failure (auto-recovers the instance); emails go to `alarm_email` |

## Troubleshooting

| Symptom | Check |
|---|---|
| `build` job: AccessDenied on `sts:AssumeRoleWithWebIdentity` | Repo variables set? Environment named exactly `production`? `github_repository` in tfvars matches `vkotha1vsp/cloudops-journal`? |
| CodeBuild fails at `docker build` with rate-limit errors | Base images come from ECR Public already; re-run. If it persists, raise the project's compute size |
| `deploy` job: `InvalidInstanceId` | The instance's SSM agent hasn't registered yet; wait 2–3 minutes after `apply` and re-run |
| Deploy says health check failed and rolled back | CloudWatch stream `app`: usually a missing setting or a failing migration |
| Browser shows 502/503 | Target group health in the EC2 console; `sudo docker compose -f /opt/cloudops/compose.yml ps` via Session Manager |
| Cognito `redirect_mismatch` | You changed `app_subdomain`/`hosted_zone_name` after creating the client: `terraform apply` again |
| Sign-in returns "not allowed" | You used an email other than `admin_email` |

## Remove everything

```bash
cd infra/ec2-terraform
terraform apply -var deletion_protection=false   # unlocks ALB, instance, Cognito, buckets
terraform destroy
```

This deletes the database with the instance. Download a recent backup from the backups bucket first if you
want to keep your data. Your hosted zone and domain are untouched.
