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
