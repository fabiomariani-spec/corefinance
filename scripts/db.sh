#!/usr/bin/env bash
# Roda SQL no Postgres do Supabase. Uso:
#   bash scripts/db.sh "SELECT 1"
#   bash scripts/db.sh < query.sql
set -euo pipefail
cd "$(dirname "$0")/.."
DBURL=$(grep "^DATABASE_URL=" .env.local | cut -d= -f2-)
export DATABASE_URL="$DBURL"
export NODE_TLS_REJECT_UNAUTHORIZED=0
if [ $# -gt 0 ]; then
  node scripts/db.mjs "$1"
else
  node scripts/db.mjs
fi
