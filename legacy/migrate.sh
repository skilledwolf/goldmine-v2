#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:-dev}"

print_usage() {
  cat <<'USAGE'
Usage: ./legacy/migrate.sh [dev|prod]

Runs the legacy MariaDB -> Postgres import as a decoupled second step after the app is up.

Required inputs (repo-root relative):
  - legacy/sql/legacy.sql
  - legacy/lectures/   (mirrors legacy fs_path, e.g. QM1/2014HS/...)

Environment variables:
  COMPOSE_CMD          Docker compose command (default: "docker compose")
  TARGET_DB            Postgres database to import into (default: $POSTGRES_DB or goldmine_v2)
  POSTGRES_USER        Postgres user for pg_isready/psql (default: goldmine_user)
  LEGACY_DB_NAME       MariaDB database name (default: legacy_goldmine)
  LEGACY_DB_USER       MariaDB user (default: root)
  LEGACY_DB_PASSWORD   MariaDB password (default: root)
  FORCE                Set to 1 to import into a non-empty DB (default: 0)
  OVERWRITE            Set to 1 to overwrite existing lecture files when copying assets (default: 0)
  RECREATE_LEGACY_DB   Set to 0 to reuse an existing legacy_db container (default: 1)
  WAIT_SECONDS         Readiness timeout (default: 60)

Examples:
  ./scripts/gm.sh dev empty
  ./legacy/migrate.sh dev

  ./scripts/gm.sh dev demo
  FORCE=1 ./legacy/migrate.sh dev
USAGE
}

case "$MODE" in
  dev) BASE_FILE="docker-compose.yml" ;;
  prod) BASE_FILE="docker-compose.prod.yml" ;;
  ""|-h|--help|help)
    print_usage
    exit 0
    ;;
  *)
    echo "Unknown mode: $MODE (expected dev or prod)" >&2
    print_usage >&2
    exit 2
    ;;
esac

COMPOSE=${COMPOSE_CMD:-"docker compose"}
BASE_ARGS=(-f "$BASE_FILE" -f "legacy/docker-compose.legacy.yml" --profile legacy)

DB_SERVICE=${DB_SERVICE:-db}
BACKEND_SERVICE=${BACKEND_SERVICE:-backend}
MIGRATE_SERVICE=${MIGRATE_SERVICE:-migrate}
LEGACY_SERVICE=${LEGACY_SERVICE:-legacy_db}

POSTGRES_USER=${POSTGRES_USER:-goldmine_user}
TARGET_DB=${TARGET_DB:-${POSTGRES_DB:-goldmine_v2}}

LEGACY_DB_NAME=${LEGACY_DB_NAME:-legacy_goldmine}
LEGACY_DB_USER=${LEGACY_DB_USER:-root}
LEGACY_DB_PASSWORD=${LEGACY_DB_PASSWORD:-root}

FORCE=${FORCE:-0}
OVERWRITE=${OVERWRITE:-0}
RECREATE_LEGACY_DB=${RECREATE_LEGACY_DB:-1}
WAIT_SECONDS=${WAIT_SECONDS:-60}

LEGACY_SQL_PATH=${LEGACY_SQL_PATH:-legacy/sql/legacy.sql}
LEGACY_LECTURES_DIR=${LEGACY_LECTURES_DIR:-legacy/lectures}

run() {
  printf '+'
  for arg in "$@"; do
    printf ' %q' "$arg"
  done
  printf '\n'
  "$@"
}

warn() {
  printf "WARN: %s\n" "$*" >&2
}

wait_for_postgres() {
  printf "==> Waiting for Postgres...\n"
  local elapsed=0
  while [ "$elapsed" -lt "$WAIT_SECONDS" ]; do
    if $COMPOSE "${BASE_ARGS[@]}" exec -T "$DB_SERVICE" pg_isready -U "$POSTGRES_USER" -d postgres >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  printf "ERROR: Postgres did not become ready within %ss\n" "$WAIT_SECONDS" >&2
  return 1
}

wait_for_mariadb() {
  printf "==> Waiting for MariaDB (legacy)...\n"
  local elapsed=0
  while [ "$elapsed" -lt "$WAIT_SECONDS" ]; do
    if $COMPOSE "${BASE_ARGS[@]}" exec -T "$LEGACY_SERVICE" mariadb -u"$LEGACY_DB_USER" -p"$LEGACY_DB_PASSWORD" -e "SELECT 1" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  printf "ERROR: MariaDB did not become ready within %ss\n" "$WAIT_SECONDS" >&2
  return 1
}

if [ ! -f "$LEGACY_SQL_PATH" ]; then
  warn "legacy SQL dump not found at $LEGACY_SQL_PATH"
  warn "Place it there or set LEGACY_SQL_PATH."
fi

if [ ! -d "$LEGACY_LECTURES_DIR" ]; then
  warn "legacy lecture tree not found at $LEGACY_LECTURES_DIR"
  warn "Place files there or set LEGACY_LECTURES_DIR."
fi

printf "==> Ensuring app DB is running...\n"
run $COMPOSE "${BASE_ARGS[@]}" up -d "$DB_SERVICE" >/dev/null

wait_for_postgres

printf "==> Ensuring migrations are applied...\n"
run $COMPOSE "${BASE_ARGS[@]}" run --rm --no-deps -T "$MIGRATE_SERVICE" >/dev/null

if [ "$RECREATE_LEGACY_DB" = "1" ]; then
  printf "==> Recreating legacy_db so legacy/sql/legacy.sql is re-imported...\n"
  run $COMPOSE "${BASE_ARGS[@]}" rm -sf "$LEGACY_SERVICE" >/dev/null || true
fi

printf "==> Starting legacy_db...\n"
run $COMPOSE "${BASE_ARGS[@]}" up -d "$LEGACY_SERVICE" >/dev/null

wait_for_mariadb

printf "==> Ensuring target database exists: %s\n" "$TARGET_DB"
DB_EXISTS=$($COMPOSE "${BASE_ARGS[@]}" exec -T "$DB_SERVICE" psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${TARGET_DB}'")
if [ -z "$DB_EXISTS" ]; then
  run $COMPOSE "${BASE_ARGS[@]}" exec -T "$DB_SERVICE" psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE ${TARGET_DB};" >/dev/null
fi

printf "==> Running migrations in target database...\n"
run $COMPOSE "${BASE_ARGS[@]}" run --rm --no-deps -T "$BACKEND_SERVICE" env POSTGRES_DB="$TARGET_DB" python manage.py migrate --noinput >/dev/null

EXISTING_COUNT=$($COMPOSE "${BASE_ARGS[@]}" exec -T "$DB_SERVICE" psql -U "$POSTGRES_USER" -d "$TARGET_DB" -tAc "SELECT COUNT(*) FROM core_lecture")
EXISTING_COUNT=${EXISTING_COUNT:-0}
if [ "$EXISTING_COUNT" -gt 0 ] && [ "$FORCE" != "1" ]; then
  printf "ERROR: Target database already has data (core_lecture=%s). Set FORCE=1 to proceed.\n" "$EXISTING_COUNT" >&2
  exit 1
fi

if [ -d "$LEGACY_LECTURES_DIR" ]; then
  printf "==> Copying legacy lecture assets into app media (OVERWRITE=%s)...\n" "$OVERWRITE"
  COPY_CMD='set -e; mkdir -p /app/media/lectures; if [ "${OVERWRITE:-0}" = "1" ]; then cp -a /legacy/lectures/. /app/media/lectures/; else cp -an /legacy/lectures/. /app/media/lectures/; fi'
  run $COMPOSE "${BASE_ARGS[@]}" run --rm --no-deps -T -v "${ROOT_DIR%/}/${LEGACY_LECTURES_DIR%/}:/legacy/lectures:ro" "$BACKEND_SERVICE" env OVERWRITE="$OVERWRITE" sh -c "$COPY_CMD" >/dev/null
fi

printf "==> Running legacy migration into %s...\n" "$TARGET_DB"
run $COMPOSE "${BASE_ARGS[@]}" run --rm --no-deps -T "$BACKEND_SERVICE" env \
  POSTGRES_DB="$TARGET_DB" \
  LEGACY_DB_NAME="$LEGACY_DB_NAME" \
  LEGACY_DB_USER="$LEGACY_DB_USER" \
  LEGACY_DB_PASSWORD="$LEGACY_DB_PASSWORD" \
  LEGACY_DB_HOST="$LEGACY_SERVICE" \
  LEGACY_DB_PORT="3306" \
  python manage.py migrate_legacy

printf "==> Validating counts...\n"
LEGACY_COUNTS=$($COMPOSE "${BASE_ARGS[@]}" exec -T "$LEGACY_SERVICE" mariadb -u"$LEGACY_DB_USER" -p"$LEGACY_DB_PASSWORD" -D "$LEGACY_DB_NAME" -N -e "\
SELECT 'legacy_lectures', COUNT(*) FROM uebbase_lecture
UNION ALL SELECT 'legacy_semester_groups', COUNT(*) FROM uebbase_semesterexercisegroup
UNION ALL SELECT 'legacy_series', COUNT(*) FROM uebbase_serie
UNION ALL SELECT 'legacy_exercises', COUNT(*) FROM uebbase_exercise
UNION ALL SELECT 'legacy_comments', COUNT(*) FROM uebview_usercomment;")

PG_COUNTS=$($COMPOSE "${BASE_ARGS[@]}" exec -T "$DB_SERVICE" psql -U "$POSTGRES_USER" -d "$TARGET_DB" -tA -c "\
SELECT 'new_lectures', COUNT(*) FROM core_lecture
UNION ALL SELECT 'new_semester_groups', COUNT(*) FROM core_semestergroup
UNION ALL SELECT 'new_series', COUNT(*) FROM core_series
UNION ALL SELECT 'new_exercises', COUNT(*) FROM core_exercise
UNION ALL SELECT 'new_comments', COUNT(*) FROM core_usercomment;")

printf "\nLegacy counts:\n%s\n\n" "$LEGACY_COUNTS"
printf "New counts:\n%s\n\n" "$PG_COUNTS"

printf "==> Stopping legacy_db...\n"
run $COMPOSE "${BASE_ARGS[@]}" stop "$LEGACY_SERVICE" >/dev/null || true

printf "==> Legacy import complete. Target DB: %s\n" "$TARGET_DB"
