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
  ensure-admin    Create/update dev admin user (prompt or env vars)
  status          Show dev services

Prod commands:
  up              Start prod stack (docker-compose.prod.yml)
  down            Stop prod stack (keeps volumes)
  reset           Stop prod stack and remove volumes
  migrate         Run Django migrations (one-off)
  seed-demo       Seed demo data (for staging/demo)
  status          Show prod services

Notes:
  - To auto-create a dev admin, set DJANGO_SUPERUSER_USERNAME + DJANGO_SUPERUSER_PASSWORD (optional DJANGO_SUPERUSER_EMAIL).
  - For backwards compatibility, GM_ADMIN_USERNAME/GM_ADMIN_PASSWORD/GM_ADMIN_EMAIL are also supported.
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
  local allow_prompt="${1:-0}"
  if [ "${SKIP_ADMIN:-0}" = "1" ]; then
    return 0
  fi

  local username="${DJANGO_SUPERUSER_USERNAME:-${GM_ADMIN_USERNAME:-}}"
  local password="${DJANGO_SUPERUSER_PASSWORD:-${GM_ADMIN_PASSWORD:-}}"
  local email="${DJANGO_SUPERUSER_EMAIL:-${GM_ADMIN_EMAIL:-admin@example.com}}"

  if [ -z "${username}" ] || [ -z "${password}" ]; then
    if [ "${allow_prompt}" = "1" ] && [ -t 0 ]; then
      if [ -z "${username}" ]; then
        read -r -p "Admin username [admin]: " username
        username="${username:-admin}"
      fi
      if [ -z "${password}" ]; then
        read -r -s -p "Admin password: " password
        echo
      fi
      if [ -z "${email}" ]; then
        read -r -p "Admin email [admin@example.com]: " email
        email="${email:-admin@example.com}"
      fi
    fi
  fi

  if [ -z "${username}" ] || [ -z "${password}" ]; then
    if [ "${allow_prompt}" = "1" ]; then
      echo "Dev admin not created: missing credentials." >&2
      echo "Set DJANGO_SUPERUSER_USERNAME + DJANGO_SUPERUSER_PASSWORD (optional DJANGO_SUPERUSER_EMAIL) and rerun." >&2
      echo "Alternatively run: docker compose exec backend python manage.py createsuperuser" >&2
      return 2
    fi
    return 0
  fi

  DJANGO_SUPERUSER_USERNAME="${username}" \
  DJANGO_SUPERUSER_PASSWORD="${password}" \
  DJANGO_SUPERUSER_EMAIL="${email}" \
  run $DEV_COMPOSE run --rm --no-deps -T \
    -e DJANGO_SUPERUSER_USERNAME \
    -e DJANGO_SUPERUSER_PASSWORD \
    -e DJANGO_SUPERUSER_EMAIL \
    backend python manage.py shell -c 'from django.contrib.auth import get_user_model; import os; User=get_user_model(); username=os.environ["DJANGO_SUPERUSER_USERNAME"]; password=os.environ["DJANGO_SUPERUSER_PASSWORD"]; email=os.environ.get("DJANGO_SUPERUSER_EMAIL","admin@example.com"); u, created = User.objects.get_or_create(username=username, defaults={"email": email}); u.email = email or u.email or "admin@example.com"; u.is_staff = True; u.is_superuser = True; u.set_password(password); u.save(); print(("created" if created else "updated") + " superuser: " + u.username)'
}

dev_cmd() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    up)
      run $DEV_COMPOSE up -d --build
      dev_ensure_admin 0
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
      dev_ensure_admin 1
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
