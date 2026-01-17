#!/bin/sh
set -e

wait_for_postgres() {
  python - <<'PY'
import os, time, psycopg2

host = os.getenv("POSTGRES_HOST", "db")
port = int(os.getenv("POSTGRES_PORT", "5432"))
user = os.getenv("POSTGRES_USER", "goldmine_user")
password = os.getenv("POSTGRES_PASSWORD", "goldmine_dev_secret")
dbname = os.getenv("POSTGRES_DB", "goldmine_v2")

for attempt in range(30):
    try:
        conn = psycopg2.connect(host=host, port=port, user=user, password=password, dbname=dbname)
        conn.close()
        print("Postgres is ready.")
        break
    except Exception as exc:  # noqa: PERF203 - simple retry loop
        print(f"Waiting for Postgres ({attempt+1}/30): {exc}")
        time.sleep(1)
else:
    raise SystemExit("Postgres did not become ready in time.")
PY
}

wait_for_mariadb() {
  if [ "${RUN_LEGACY_MIGRATION:-0}" != "0" ]; then
    python - <<'PY'
import os, time, MySQLdb  # provided by mysqlclient

host = os.getenv("LEGACY_DB_HOST", "legacy_db")
port = int(os.getenv("LEGACY_DB_PORT", "3306"))
user = os.getenv("LEGACY_DB_USER", "root")
password = os.getenv("LEGACY_DB_PASSWORD", "root")
dbname = os.getenv("LEGACY_DB_NAME", "legacy_goldmine")

for attempt in range(30):
    try:
        conn = MySQLdb.connect(host=host, port=port, user=user, passwd=password, db=dbname)
        conn.close()
        print("MariaDB (legacy) is ready.")
        break
    except Exception as exc:
        print(f"Waiting for MariaDB ({attempt+1}/30): {exc}")
        time.sleep(1)
else:
    raise SystemExit("MariaDB did not become ready in time.")
PY
  fi
}

wait_for_postgres
wait_for_mariadb

if [ "${DJANGO_SKIP_MIGRATIONS:-0}" != "1" ]; then
  python manage.py migrate --noinput

  if [ "${RUN_LEGACY_MIGRATION:-0}" != "0" ]; then
    python manage.py migrate_legacy
  fi
fi

if [ "${SEED_DEV_DATA:-0}" != "0" ]; then
  python manage.py seed_dev_data
fi

if [ "${DJANGO_COLLECTSTATIC:-0}" != "0" ]; then
  python manage.py collectstatic --noinput
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

DEBUG_FLAG="${DJANGO_DEBUG:-1}"
if [ "${DJANGO_USE_GUNICORN:-0}" != "0" ] || [ "${DEBUG_FLAG}" = "0" ] || [ "${DEBUG_FLAG}" = "false" ] || [ "${DEBUG_FLAG}" = "False" ] || [ "${DEBUG_FLAG}" = "FALSE" ]; then
  GUNICORN_BIND="${GUNICORN_BIND:-0.0.0.0:8000}"
  GUNICORN_WORKERS="${WEB_CONCURRENCY:-3}"
  GUNICORN_TIMEOUT="${GUNICORN_TIMEOUT:-120}"
  exec gunicorn config.wsgi:application --bind "${GUNICORN_BIND}" --workers "${GUNICORN_WORKERS}" --timeout "${GUNICORN_TIMEOUT}"
fi

exec python manage.py runserver 0.0.0.0:8000
