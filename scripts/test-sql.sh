#!/usr/bin/env bash
# Valide les migrations Supabase, le seed SQL et les politiques RLS sur un
# PostgreSQL local (≥ 15). Usage : PGBIN=/usr/lib/postgresql/16/bin scripts/test-sql.sh
# Le cluster temporaire est créé dans $PGTMP (par défaut /var/tmp/bdo-pg) puis arrêté.
set -euo pipefail
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGTMP="${PGTMP:-/var/tmp/bdo-pg}"
SOCK="${PGTMP}-sock"
PORT="${PGPORT_TEST:-5499}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then RUN_AS=(su postgres -c); fi
run() { if [ ${#RUN_AS[@]} -gt 0 ]; then "${RUN_AS[@]}" "$*"; else bash -c "$*"; fi; }

rm -rf "$PGTMP" "$SOCK" && mkdir -p "$PGTMP" "$SOCK"
[ "$(id -u)" = "0" ] && chown postgres:postgres "$PGTMP" "$SOCK"
run "$PGBIN/initdb -D $PGTMP -A trust -U postgres" >/dev/null
run "$PGBIN/pg_ctl -D $PGTMP -o '-p $PORT -k $SOCK' -l $PGTMP/log start" >/dev/null
trap 'run "$PGBIN/pg_ctl -D $PGTMP stop" >/dev/null' EXIT
sleep 2
P="psql -h $SOCK -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "create database bdo"
npx tsx scripts/generate-seed-sql.ts
for f in supabase/tests/bootstrap.sql supabase/migrations/*.sql supabase/seed.sql supabase/tests/rls.sql; do
  echo "→ $f"
  $P -d bdo -f "$f" >/dev/null
done
# Reprise des données legacy par la migration CRM : base séparée, migrations 001-003, données v2, puis 004.
$P -c "create database bdo_legacy"
for f in supabase/tests/bootstrap.sql supabase/migrations/2026101500000[123]_*.sql supabase/tests/crm_legacy.sql supabase/migrations/20261015000004_crm.sql supabase/tests/crm_legacy_check.sql; do
  echo "→ (legacy) $f"
  $P -d bdo_legacy -f "$f" >/dev/null
done
echo "Migrations, seed, RLS et reprise CRM : OK"
