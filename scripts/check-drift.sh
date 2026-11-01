#!/usr/bin/env bash
# Fails if the migrated database differs from prisma/schema.prisma.
# Run after `prisma migrate deploy` against a disposable database (CI does this).
# The full-text expression indexes (*_fts_idx) are intentionally outside the Prisma schema,
# so a diff that only drops those is not drift.
set -euo pipefail
diff_sql=$(npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script)
remaining=$(printf '%s\n' "$diff_sql" | grep -vE '^\s*$|^--|DROP INDEX "[A-Za-z]+_fts_idx"' || true)
if [[ -n "$remaining" ]]; then
  echo "✘ Schema drift: migrations do not match prisma/schema.prisma. Differences:"
  printf '%s\n' "$remaining"
  echo "Fix: npx prisma migrate dev --name <change>  (against a local database) and commit the migration."
  exit 1
fi
echo "✔ Migrations match prisma/schema.prisma"
