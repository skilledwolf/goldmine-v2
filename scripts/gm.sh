#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DEV_COMPOSE=${DEV_COMPOSE:-"docker compose"}
PROD_COMPOSE=${PROD_COMPOSE:-"docker compose -f docker-compose.prod.yml"}

print_usage() {
  cat <<'USAGE'
Usage: ./scripts/gm.sh <dev|prod> <command>

Dev commands:
  up              Start dev stack (db+redis+migrate+backend+worker+frontend)
  down            Stop dev stack (keeps volumes)
  reset           Stop dev stack and remove volumes
  empty           reset + up
  seed-demo       Seed demo data into dev DB
  demo            empty + seed-demo
  ensure-admin    Create/update dev admin user (admin/admin)
  status          Show dev services

Prod commands:
  up              Start prod stack (docker-compose.prod.yml)
  down            Stop prod stack (keeps volumes)
  reset           Stop prod stack and remove volumes
  migrate         Run Django migrations (one-off)
  seed-demo       Seed demo data (for staging/demo)
  status          Show prod services

Notes:
  - For legacy imports, use the decoupled script: ./legacy/migrate.sh dev|prod
  - Set SKIP_ADMIN=1 to skip creating admin/admin in dev modes that start the stack.
USAGE
}

run() {
  printf '+'
  for arg in "$@"; do
    printf ' %q' "$arg"
  done
  printf '\n'
  "$@"
}

dev_ensure_admin() {
  if [ "${SKIP_ADMIN:-0}" = "1" ]; then
    return 0
  fi
  run $DEV_COMPOSE run --rm --no-deps -T backend python manage.py shell -c 'from django.contrib.auth import get_user_model; User=get_user_model(); u, created = User.objects.get_or_create(username="admin", defaults={"email":"admin@example.com"}); u.email = u.email or "admin@example.com"; u.is_staff = True; u.is_superuser = True; u.set_password("admin"); u.save(); print(("created" if created else "updated") + " superuser: " + u.username)'
}

dev_cmd() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    up)
      run $DEV_COMPOSE up -d --build
      dev_ensure_admin
      ;;
    down)
      run $DEV_COMPOSE down --remove-orphans
      ;;
    reset)
      run $DEV_COMPOSE down -v --remove-orphans
      ;;
    empty)
      "$0" dev reset
      "$0" dev up
      ;;
    seed-demo)
      run $DEV_COMPOSE run --rm migrate
      run $DEV_COMPOSE --profile seed run --rm seed_demo
      ;;
    demo)
      "$0" dev empty
      "$0" dev seed-demo
      ;;
    ensure-admin)
      dev_ensure_admin
      ;;
    status)
      run $DEV_COMPOSE ps
      ;;
    ""|-h|--help|help)
      print_usage
      ;;
    *)
      echo "Unknown dev command: $cmd" >&2
      print_usage >&2
      return 2
      ;;
  esac
}

prod_cmd() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    up)
      run $PROD_COMPOSE up -d
      ;;
    down)
      run $PROD_COMPOSE down --remove-orphans
      ;;
    reset)
      run $PROD_COMPOSE down -v --remove-orphans
      ;;
    migrate)
      run $PROD_COMPOSE run --rm migrate
      ;;
    seed-demo)
      run $PROD_COMPOSE run --rm migrate
      run $PROD_COMPOSE --profile seed run --rm seed_demo
      ;;
    status)
      run $PROD_COMPOSE ps
      ;;
    ""|-h|--help|help)
      print_usage
      ;;
    *)
      echo "Unknown prod command: $cmd" >&2
      print_usage >&2
      return 2
      ;;
  esac
}

main() {
  local env="${1:-}"
  shift || true
  case "$env" in
    dev) dev_cmd "$@" ;;
    prod) prod_cmd "$@" ;;
    ""|-h|--help|help)
      print_usage
      ;;
    *)
      echo "Unknown environment: $env" >&2
      print_usage >&2
      return 2
      ;;
  esac
}

main "$@"
