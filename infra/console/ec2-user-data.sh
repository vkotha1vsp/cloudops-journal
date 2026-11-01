#!/bin/bash
# CloudOps Journal: EC2 user data for the CONSOLE setup (docs/06-CONSOLE-SETUP.md, step 9).
# Paste this whole file into EC2 → Launch instance → Advanced details → User data,
# after editing the 6 values in the box below. Everything else stays as it is.

# ╔══════════════════════ EDIT THESE 6 VALUES ══════════════════════╗
AWS_REGION=us-east-1
ACCOUNT_ID=123456789012
APP_DOMAIN=learn.example.com
ADMIN_EMAIL=you@example.com
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
# ╚═════════════════════════════════════════════════════════════════╝

# Names used in the console guide (change only if you named things differently)
ECR_REPOSITORY_NAME=cloudops-journal
SECRET_ID=cloudops-journal/app
ATTACHMENTS_BUCKET=cloudops-journal-attachments-$ACCOUNT_ID
BACKUP_BUCKET=cloudops-journal-backups-$ACCOUNT_ID
LOG_GROUP=/ec2/cloudops-journal
COMPOSE_VERSION=v2.32.4

set -euxo pipefail
exec > >(tee /var/log/cloudops-setup.log) 2>&1

dnf install -y docker jq
systemctl enable --now docker
mkdir -p /usr/libexec/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/download/$COMPOSE_VERSION/docker-compose-linux-x86_64" \
  -o /usr/libexec/docker/cli-plugins/docker-compose
chmod +x /usr/libexec/docker/cli-plugins/docker-compose

if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

mkdir -p /opt/cloudops /var/lib/cloudops/pgdata
cd /opt/cloudops

cat > config.env <<CFG
AWS_REGION=$AWS_REGION
ECR_REPOSITORY_URI=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY_NAME
SECRET_ID=$SECRET_ID
APP_DOMAIN=$APP_DOMAIN
ALLOWED_EMAILS=$(echo "$ADMIN_EMAIL" | tr '[:upper:]' '[:lower:]')
COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID
COGNITO_ISSUER=https://cognito-idp.$AWS_REGION.amazonaws.com/$COGNITO_USER_POOL_ID
S3_ATTACHMENTS_BUCKET=$ATTACHMENTS_BUCKET
BACKUP_BUCKET=$BACKUP_BUCKET
LOG_GROUP=$LOG_GROUP
CFG
chmod 600 config.env

cat > compose.yml <<'CLOUDOPS_COMPOSE'
# /opt/cloudops/compose.yml on the EC2 instance. Values come from /opt/cloudops/.env,
# which deploy.sh writes from config.env + Secrets Manager (mode 600, never in Git).
name: cloudops

services:
  db:
    image: public.ecr.aws/docker/library/postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: cloudops
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: cloudops
    volumes:
      - /var/lib/cloudops/pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cloudops"]
      interval: 5s
      retries: 30
    logging:
      driver: awslogs
      options:
        awslogs-region: ${AWS_REGION}
        awslogs-group: ${LOG_GROUP}
        awslogs-create-group: "false"
        awslogs-stream: db
    # Not published: reachable only from containers on this host.

  migrate:
    image: ${MIGRATE_IMAGE}
    profiles: ["migrate"]
    environment:
      DATABASE_URL: postgresql://cloudops:${POSTGRES_PASSWORD}@db:5432/cloudops?schema=public
    depends_on:
      db: { condition: service_healthy }
    logging:
      driver: awslogs
      options:
        awslogs-region: ${AWS_REGION}
        awslogs-group: ${LOG_GROUP}
        awslogs-create-group: "false"
        awslogs-stream: migrate

  app:
    image: ${IMAGE}
    restart: unless-stopped
    ports:
      - "3000:3000" # instance security group allows this port only from the ALB
    environment:
      DATABASE_URL: postgresql://cloudops:${POSTGRES_PASSWORD}@db:5432/cloudops?schema=public
      NEXTAUTH_URL: https://${APP_DOMAIN}
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      ALLOWED_EMAILS: ${ALLOWED_EMAILS}
      COGNITO_CLIENT_ID: ${COGNITO_CLIENT_ID}
      COGNITO_CLIENT_SECRET: ${COGNITO_CLIENT_SECRET}
      COGNITO_ISSUER: ${COGNITO_ISSUER}
      AWS_REGION: ${AWS_REGION}
      S3_ATTACHMENTS_BUCKET: ${S3_ATTACHMENTS_BUCKET}
      MAX_UPLOAD_MB: "25"
    depends_on:
      db: { condition: service_healthy }
    logging:
      driver: awslogs
      options:
        awslogs-region: ${AWS_REGION}
        awslogs-group: ${LOG_GROUP}
        awslogs-create-group: "false"
        awslogs-stream: app
CLOUDOPS_COMPOSE

cat > deploy.sh <<'CLOUDOPS_DEPLOY'
#!/usr/bin/env bash
# /opt/cloudops/deploy.sh <image-tag>
# Pulls the image from ECR, runs database migrations, restarts the app, checks health,
# and rolls back to the previous tag if the new one is unhealthy.
# Called by GitHub Actions through SSM Run Command, or manually:
#   sudo /opt/cloudops/deploy.sh <git-sha>
set -euo pipefail
cd "${CLOUDOPS_DIR:-/opt/cloudops}"
# shellcheck disable=SC1091
source ./config.env

TAG="${1:-latest}"
PREVIOUS="$(cat current-tag 2>/dev/null || true)"
REGISTRY="${ECR_REPOSITORY_URI%%/*}"

log() { echo "[deploy $(date -u +%H:%M:%S)] $*"; }

write_env() { # tag
  local secret
  secret="$(aws secretsmanager get-secret-value --region "$AWS_REGION" --secret-id "$SECRET_ID" --query SecretString --output text)"
  umask 077
  {
    cat config.env
    echo "POSTGRES_PASSWORD=$(jq -r .POSTGRES_PASSWORD <<<"$secret")"
    echo "NEXTAUTH_SECRET=$(jq -r .NEXTAUTH_SECRET <<<"$secret")"
    echo "COGNITO_CLIENT_SECRET=$(jq -r .COGNITO_CLIENT_SECRET <<<"$secret")"
    echo "IMAGE=$ECR_REPOSITORY_URI:$1"
    echo "MIGRATE_IMAGE=$ECR_REPOSITORY_URI:migrate-$1"
  } > .env.tmp
  mv .env.tmp .env
}

healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then return 0; fi
    sleep 4
  done
  return 1
}

run() { # tag
  write_env "$1"
  log "Pulling $ECR_REPOSITORY_URI:$1"
  docker compose pull --quiet app
  docker compose --profile migrate pull --quiet migrate
  log "Starting database"
  docker compose up -d --wait db
  log "Applying migrations"
  docker compose --profile migrate run --rm migrate
  log "Starting app"
  docker compose up -d app
  healthy
}

log "Logging in to $REGISTRY"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null

if run "$TAG"; then
  echo "$TAG" > current-tag
  docker image prune -af --filter "until=168h" >/dev/null || true
  log "✔ Deployed $TAG"
  exit 0
fi

log "✘ $TAG failed its health check. Recent app logs are in CloudWatch (stream: app)."
if [[ -n "$PREVIOUS" && "$PREVIOUS" != "$TAG" ]]; then
  log "Rolling back to $PREVIOUS (migrations are not reverted; Prisma migrations should stay backward compatible)"
  if run "$PREVIOUS"; then log "Rolled back to $PREVIOUS"; else log "Rollback also failed"; fi
fi
exit 1
CLOUDOPS_DEPLOY

cat > backup.sh <<'CLOUDOPS_BACKUP'
#!/usr/bin/env bash
# /opt/cloudops/backup.sh: nightly pg_dump to S3 (run by cloudops-backup.timer).
set -euo pipefail
cd "${CLOUDOPS_DIR:-/opt/cloudops}"
# shellcheck disable=SC1091
source ./config.env
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
key="postgres/cloudops-${stamp}.dump"
docker compose exec -T db pg_dump -U cloudops -d cloudops -Fc \
  | aws s3 cp - "s3://${BACKUP_BUCKET}/${key}" --region "$AWS_REGION" --sse AES256
echo "backup ok: s3://${BACKUP_BUCKET}/${key}"
CLOUDOPS_BACKUP
chmod 700 deploy.sh backup.sh

cat > /etc/systemd/system/cloudops-backup.service <<'UNIT'
[Unit]
Description=CloudOps Journal database backup to S3
After=docker.service
[Service]
Type=oneshot
ExecStart=/opt/cloudops/backup.sh
UNIT
cat > /etc/systemd/system/cloudops-backup.timer <<'UNIT'
[Unit]
Description=Nightly CloudOps Journal backup
[Timer]
OnCalendar=*-*-* 07:30:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now cloudops-backup.timer

if aws ecr describe-images --region "$AWS_REGION" --repository-name "$ECR_REPOSITORY_NAME" --image-ids imageTag=latest >/dev/null 2>&1; then
  /opt/cloudops/deploy.sh latest || echo "Initial deploy failed; run: sudo /opt/cloudops/deploy.sh latest"
else
  echo "No image in ECR yet. Run the GitHub Actions workflow to build and deploy."
fi
echo "CloudOps setup finished"
