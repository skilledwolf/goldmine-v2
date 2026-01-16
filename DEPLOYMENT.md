# Production deployment (Docker + Caddy)

This repo ships a production compose file and a Caddy reverse proxy.

## Prereqs
- Docker + Docker Compose v2
- A DNS name pointing to your server (for HTTPS)

## 1) Set environment variables
Create a `.env` in the repo root (used by `docker-compose.prod.yml`). Example:

```
DOMAIN=your-domain.com
DJANGO_SECRET_KEY=change-me
ALLOWED_HOSTS=your-domain.com
POSTGRES_PASSWORD=change-me
CORS_ALLOWED_ORIGINS=https://your-domain.com
CSRF_TRUSTED_ORIGINS=https://your-domain.com
```

Optional tuning:
```
DJANGO_SECURE_SSL_REDIRECT=true
SECURE_HSTS_SECONDS=31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS=true
SECURE_HSTS_PRELOAD=true
```

## 2) Put lecture files in place
The backend expects lecture assets under `/app/media/lectures` inside the `backend` container.
By default, this path is backed by the `media_data` volume. You can:
- copy files into the running container volume, or
- replace `media_data:/app/media` with a host bind mount to your lecture archive.

## 3) Start the stack

```
docker compose -f docker-compose.prod.yml up -d --build
```

Caddy will obtain TLS certificates for `DOMAIN` automatically.

The render worker runs in a separate `worker` service and needs Redis. Both are included
in `docker-compose.prod.yml`.

## 4) Create a superuser

```
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser
```

## Backups & restore (recommended)

Backups are usually an infrastructure concern, not application code. This repo does **not** run cron/scheduled backups for you, but you should back up the data volumes used by the production stack.

### What to back up
- **Postgres**: `postgres_data` (or a `pg_dump`).
- **Media / lecture assets**: `media_data` (or a tarball/sync of `/app/media`).
- **Optional**: Caddy state (`caddy_data`) to preserve TLS cert cache across restores (certs can be re-issued, but may hit rate limits if you rebuild often).
- **Not needed**: Redis (queue/cache) is typically ephemeral.

### Best practice (easiest ops)
- Use a **managed Postgres** with automatic backups + point-in-time recovery.
- Store media in **object storage** (S3/GCS/etc.) with versioning/retention.

### Self-hosted VM (example commands)
Create a local folder for backup artifacts:

```
mkdir -p backups
```

Database dump:

```
docker compose -f docker-compose.prod.yml exec -T db sh -lc \
  'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > backups/postgres.sql
```

Media tarball:

```
docker compose -f docker-compose.prod.yml exec -T backend sh -lc \
  'tar -czf - -C /app/media .' \
  > backups/media.tgz
```

Store these artifacts off-host (and preferably encrypted), and keep a retention policy (e.g. daily + weekly).

### Restore (high-level)
1) Bring up the stack (`docker compose -f docker-compose.prod.yml up -d`), then stop the app services (`backend`, `worker`, `frontend`) while restoring.
2) Restore DB:

```
cat backups/postgres.sql | docker compose -f docker-compose.prod.yml exec -T db sh -lc \
  'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

3) Restore media:

```
cat backups/media.tgz | docker compose -f docker-compose.prod.yml exec -T backend sh -lc \
  'tar -xzf - -C /app/media'
```

4) Start services and run migrations if needed (`docker compose -f docker-compose.prod.yml up -d`).
