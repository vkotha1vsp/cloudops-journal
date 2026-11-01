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
