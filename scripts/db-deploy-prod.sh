#!/usr/bin/env bash
# Safe, reviewable production schema deploy.
#
# Diffs the CURRENT prisma/schema.prisma against whatever DATABASE_URL_PROD
# actually looks like right now, shows you the exact SQL, and only applies it
# if you explicitly type "apply". Every diff is saved under
# prisma/prod-diffs/ as a timestamped record — the closest thing this project
# has to migration history until prisma migrate dev's shadow-DB issue is
# fixed (see project notes on the migration history gap).
#
# Must be run from a machine that can reach DATABASE_URL_PROD over the
# network (e.g. the production VPS itself, via SSH) — it is NOT reachable
# from a typical dev laptop.
#
# Usage:
#   git pull                      # get the latest prisma/schema.prisma
#   export DATABASE_URL_PROD=...  # or make sure it's in your shell env
#   ./scripts/db-deploy-prod.sh
set -euo pipefail

if [ -z "${DATABASE_URL_PROD:-}" ]; then
  echo "DATABASE_URL_PROD is not set in the environment." >&2
  echo "Export it first, e.g.: export DATABASE_URL_PROD='postgres://...'" >&2
  exit 1
fi

STAMP=$(date +%Y%m%d-%H%M%S)
DIFF_DIR="prisma/prod-diffs"
DIFF_FILE="${DIFF_DIR}/${STAMP}.sql"
mkdir -p "$DIFF_DIR"

echo "==> Generating dry-run diff against production (read-only, nothing applied yet)..."
npx prisma migrate diff \
  --from-url "$DATABASE_URL_PROD" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > "$DIFF_FILE"

if [ ! -s "$DIFF_FILE" ]; then
  echo "==> No differences — production schema already matches prisma/schema.prisma."
  rm -f "$DIFF_FILE"
  exit 0
fi

echo "==> Diff written to $DIFF_FILE — review it below:"
echo "-------------------------------------------------------------"
cat "$DIFF_FILE"
echo "-------------------------------------------------------------"
echo "Confirm every statement above is additive (ADD COLUMN / CREATE INDEX)."
echo "If you see DROP, ALTER COLUMN TYPE, or RENAME, STOP and investigate —"
echo "that means production has drifted from what's in git, or this change"
echo "is genuinely destructive and needs a manual, reviewed migration plan."
echo

read -r -p "Apply the above SQL to PRODUCTION? Type 'apply' to continue: " CONFIRM
if [ "$CONFIRM" != "apply" ]; then
  echo "Aborted — nothing was applied. $DIFF_FILE is kept for reference."
  exit 1
fi

echo "==> Applying to production..."
# prisma db execute has no --url flag in this Prisma version — it always
# reads DATABASE_URL via prisma.config.ts, so we override that env var for
# just this one command instead.
DATABASE_URL="$DATABASE_URL_PROD" npx prisma db execute --file "$DIFF_FILE"

echo "==> Applied successfully. Commit $DIFF_FILE as a record of what ran:"
echo "    git add $DIFF_FILE && git commit -m 'chore(db): apply prod schema diff ${STAMP}'"
