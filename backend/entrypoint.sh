#!/bin/sh
set -e

wait_for_postgres() {
  python - <<'PY'
import os, time, urllib.parse, psycopg2

database_url = os.getenv("DATABASE_URL")
if database_url:
    parsed = urllib.parse.urlparse(database_url)
    query = urllib.parse.parse_qs(parsed.query)
    sslmode = (query.get("sslmode") or [None])[0]
    conn_kwargs = {
        "host": parsed.hostname or os.getenv("POSTGRES_HOST", "db"),
        "port": int(parsed.port or os.getenv("POSTGRES_PORT", "5432")),
        "user": urllib.parse.unquote(parsed.username or "") or os.getenv("POSTGRES_USER", "goldmine_user"),
        "password": urllib.parse.unquote(parsed.password or "") or os.getenv("POSTGRES_PASSWORD", "goldmine_dev_secret"),
        "dbname": (parsed.path or "").lstrip("/") or os.getenv("POSTGRES_DB", "goldmine_v2"),
    }
    if sslmode:
        conn_kwargs["sslmode"] = sslmode
else:
    conn_kwargs = {
        "host": os.getenv("POSTGRES_HOST", "db"),
        "port": int(os.getenv("POSTGRES_PORT", "5432")),
        "user": os.getenv("POSTGRES_USER", "goldmine_user"),
        "password": os.getenv("POSTGRES_PASSWORD", "goldmine_dev_secret"),
        "dbname": os.getenv("POSTGRES_DB", "goldmine_v2"),
    }

for attempt in range(30):
    try:
        conn = psycopg2.connect(**conn_kwargs)
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

bootstrap_superuser() {
  python - <<'PY'
import os

username = os.getenv("DJANGO_SUPERUSER_USERNAME", "").strip()
password = os.getenv("DJANGO_SUPERUSER_PASSWORD", "")
email = os.getenv("DJANGO_SUPERUSER_EMAIL", "").strip()

if not username or not password:
    print("Superuser bootstrap skipped (set DJANGO_SUPERUSER_USERNAME and DJANGO_SUPERUSER_PASSWORD).")
    raise SystemExit(0)

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()

user, created = User.objects.get_or_create(
    username=username,
    defaults={"email": email} if email else {},
)

updated = False
if not user.is_staff:
    user.is_staff = True
    updated = True
if not user.is_superuser:
    user.is_superuser = True
    updated = True
if email and user.email != email:
    user.email = email
    updated = True

if created:
    user.set_password(password)
    updated = True

if updated:
    user.save()

print(("Created" if created else "Ensured") + f" superuser: {username}")
PY
}

wait_for_postgres

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

if [ "${DJANGO_SKIP_MIGRATIONS:-0}" != "1" ]; then
  python manage.py migrate --noinput
fi

bootstrap_superuser

if [ "${SEED_DEV_DATA:-0}" != "0" ]; then
  python manage.py seed_dev_data
fi

if [ "${DJANGO_COLLECTSTATIC:-0}" != "0" ]; then
  python manage.py collectstatic --noinput
fi

if [ "${START_RQWORKER:-0}" != "0" ]; then
  python manage.py rqworker default &
fi

DEBUG_FLAG="${DJANGO_DEBUG:-1}"
if [ "${DJANGO_USE_GUNICORN:-0}" != "0" ] || [ "${DEBUG_FLAG}" = "0" ] || [ "${DEBUG_FLAG}" = "false" ] || [ "${DEBUG_FLAG}" = "False" ] || [ "${DEBUG_FLAG}" = "FALSE" ]; then
  GUNICORN_BIND="${GUNICORN_BIND:-0.0.0.0:${PORT:-8000}}"
  GUNICORN_WORKERS="${WEB_CONCURRENCY:-3}"
  GUNICORN_TIMEOUT="${GUNICORN_TIMEOUT:-120}"
  exec gunicorn config.wsgi:application --bind "${GUNICORN_BIND}" --workers "${GUNICORN_WORKERS}" --timeout "${GUNICORN_TIMEOUT}"
fi

exec python manage.py runserver 0.0.0.0:${PORT:-8000}
