# Operations: backups, recovery, cleanup

## What is backed up

| Data | Option B (ECS) | Option A (EC2) |
|---|---|---|
| Database | RDS automated backups, 7 days point-in-time recovery (`db_backup_retention_days`), final snapshot on delete | Nightly `pg_dump` to S3 (`backup.sh`) + EBS snapshots |
| Attachments | S3 versioning (old versions kept 90 days) | Same, if you use the S3 bucket |
| Secrets | Secrets Manager (and Terraform state) | `infra/ec2-compose/.env`: keep a copy in a password manager |
| Infrastructure | Terraform code + versioned state bucket | `setup-ubuntu.sh` + this repo |

Every journal page also keeps its own version history inside the database (restore from **History**).

## Manual backup (any time)

```bash
# Option B: on-demand RDS snapshot
aws rds create-db-snapshot --db-instance-identifier cloudops-journal-prod \
  --db-snapshot-identifier cloudops-manual-$(date +%Y%m%d%H%M)

# Option A
./infra/ec2-compose/backup.sh
```

## Recovery procedures

**Restore to a point in time (Option B).** RDS restores into a *new* instance; then point the app at it.

```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier cloudops-journal-prod \
  --target-db-instance-identifier cloudops-journal-prod-restored \
  --restore-time 2026-11-01T03:00:00Z \
  --db-subnet-group-name cloudops-journal-prod --vpc-security-group-ids <db-sg-id> --no-publicly-accessible
```

Then either (a) update `DATABASE_URL` in the `cloudops-journal-prod/app` secret to the restored endpoint and
force a new deployment (`aws ecs update-service --cluster cloudops-journal-prod --service app --force-new-deployment`),
or (b) after verifying the data, rename instances so Terraform keeps managing the original identifier.
Run `terraform plan` afterwards and reconcile anything it reports before applying.

**Restore a pg_dump (Option A, or into any Postgres):**

```bash
aws s3 cp s3://<backup-bucket>/postgres/cloudops-<stamp>.dump ./restore.dump
docker compose -f infra/ec2-compose/docker-compose.prod.yml --env-file infra/ec2-compose/.env exec -T db \
  pg_restore -U cloudops -d cloudops --clean --if-exists < restore.dump
```

**Recover a deleted or overwritten attachment:** list versions with
`aws s3api list-object-versions --bucket <bucket> --prefix users/<user-id>/` and copy the wanted `VersionId` back.

**Recover an edited page:** open the page → History → choose a version → *Restore this version*.
Restoring snapshots the current state first, so it can itself be undone.

### Recovery drill (do this once)

1. Create a manual snapshot. 2. Restore it to a new instance as above. 3. Point a local copy of the app at it
(`DATABASE_URL=… npm run dev`, through a bastion or SSM port forward) and confirm your pages are there.
4. Delete the restored instance.

## Routine maintenance

- **Dependency updates:** `npm outdated`, update, run `npm test && npm run build`, push. CI blocks broken builds.
- **Schema changes:** edit `prisma/schema.prisma`, run `npx prisma migrate dev --name <change>` against your
  local database, commit the new folder under `prisma/migrations/`. Deploys apply it automatically.
- **Postgres minor versions** are applied by RDS in the maintenance window (`auto_minor_version_upgrade`).
- **Alarms** (Option B): 5xx responses, unhealthy targets, RDS CPU and free storage, ECS memory → SNS email.

## Cleanup (remove everything)

Option B:

```bash
cd infra/terraform
# 1. Allow deletion (database, load balancer, Cognito pool and buckets are protected by default)
terraform apply -var deletion_protection=false
# 2. Destroy. RDS takes a final snapshot named cloudops-journal-prod-final-<timestamp>.
terraform destroy
# 3. Optional: delete the final snapshot and the state bucket when you no longer need them
aws rds describe-db-snapshots --query "DBSnapshots[?starts_with(DBSnapshotIdentifier,'cloudops-journal-prod-final')].DBSnapshotIdentifier"
```

With `deletion_protection = false` the attachments bucket and ECR repository are emptied on destroy;
with it `true` (the default) destroy stops instead of deleting your data.

Your Route 53 hosted zone and domain are **not** touched; only the `learn` record and the certificate
validation record are removed.

Option A: terminate the instance, release the Elastic IP, delete the Route 53 record, the Cognito user pool
and (if no longer needed) the S3 bucket.
