#!/usr/bin/env bash
set -euo pipefail

COMPOSE_CMD=${COMPOSE_CMD:-"docker compose"}
BACKEND_SERVICE=${BACKEND_SERVICE:-backend}
DB_SERVICE=${DB_SERVICE:-db}
LEGACY_SERVICE=${LEGACY_SERVICE:-legacy_db}
POSTGRES_USER=${POSTGRES_USER:-goldmine_user}
TARGET_DB=${TARGET_DB:-goldmine_v2_legacy_import}
FORCE=${FORCE:-0}

printf "==> Ensuring services are running...\n"
$COMPOSE_CMD up -d "$DB_SERVICE" "$LEGACY_SERVICE" "$BACKEND_SERVICE" >/dev/null

printf "==> Ensuring target database exists: %s\n" "$TARGET_DB"
DB_EXISTS=$($COMPOSE_CMD exec -T "$DB_SERVICE" psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${TARGET_DB}'")
if [ -z "$DB_EXISTS" ]; then
  $COMPOSE_CMD exec -T "$DB_SERVICE" psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE ${TARGET_DB};" >/dev/null
fi

printf "==> Running migrations in target database...\n"
$COMPOSE_CMD exec -T "$BACKEND_SERVICE" env POSTGRES_DB="$TARGET_DB" SEED_DEV_DATA=0 python manage.py migrate --noinput >/dev/null

EXISTING_COUNT=$($COMPOSE_CMD exec -T "$DB_SERVICE" psql -U "$POSTGRES_USER" -d "$TARGET_DB" -tAc "SELECT COUNT(*) FROM core_lecture")
if [ "$EXISTING_COUNT" -gt 0 ] && [ "$FORCE" != "1" ]; then
  printf "Target database already has data (core_lecture=%s). Set FORCE=1 to proceed.\n" "$EXISTING_COUNT"
  exit 1
fi

printf "==> Running legacy migration...\n"
$COMPOSE_CMD exec -T "$BACKEND_SERVICE" env POSTGRES_DB="$TARGET_DB" SEED_DEV_DATA=0 python manage.py migrate_legacy

printf "==> Validating counts...\n"
LEGACY_COUNTS=$($COMPOSE_CMD exec -T "$LEGACY_SERVICE" mariadb -uroot -proot -N -e "\
SELECT 'legacy_lectures', COUNT(*) FROM uebbase_lecture
UNION ALL SELECT 'legacy_semester_groups', COUNT(*) FROM uebbase_semesterexercisegroup
UNION ALL SELECT 'legacy_series', COUNT(*) FROM uebbase_serie
UNION ALL SELECT 'legacy_exercises', COUNT(*) FROM uebbase_exercise
UNION ALL SELECT 'legacy_comments', COUNT(*) FROM uebview_usercomment;")

PG_COUNTS=$($COMPOSE_CMD exec -T "$DB_SERVICE" psql -U "$POSTGRES_USER" -d "$TARGET_DB" -tA -c "\
SELECT 'new_lectures', COUNT(*) FROM core_lecture
UNION ALL SELECT 'new_semester_groups', COUNT(*) FROM core_semestergroup
UNION ALL SELECT 'new_series', COUNT(*) FROM core_series
UNION ALL SELECT 'new_exercises', COUNT(*) FROM core_exercise
UNION ALL SELECT 'new_comments', COUNT(*) FROM core_usercomment;")

printf "\nLegacy counts:\n%s\n\n" "$LEGACY_COUNTS"
printf "New counts:\n%s\n\n" "$PG_COUNTS"

printf "==> Conversion complete. Target DB: %s\n" "$TARGET_DB"
