#!/usr/bin/env bash
# Nightly PostgreSQL backup to S3 (Option A). Cron example (02:30 daily):
#   30 2 * * * /home/ubuntu/cloudops-journal/infra/ec2-compose/backup.sh >> /var/log/cloudops-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
: "${BACKUP_BUCKET:?set BACKUP_BUCKET in .env}"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="/tmp/cloudops-${stamp}.dump"
docker compose -f docker-compose.prod.yml --env-file .env exec -T db pg_dump -U cloudops -d cloudops -Fc > "$file"
aws s3 cp "$file" "s3://${BACKUP_BUCKET}/postgres/cloudops-${stamp}.dump" --sse AES256
rm -f "$file"
echo "$(date -u) backup ok: cloudops-${stamp}.dump"
