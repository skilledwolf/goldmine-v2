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

## 3) Deployment

### Option A: The Easy Way (Pre-built Images)
This method uses Docker images built automatically by GitHub Actions.

1.  **Log in to GHCR** (only needed once):
    ```bash
    echo $CR_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
    ```
    *(You need a Personal Access Token with `read:packages` scope)*

2.  **Start the stack**:
    ```bash
    # Pull images and start
    ./scripts/deploy.sh
    ```

### Option B: Build on Server
If you prefer to build the code on the server:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Helper script (optional):

```bash
./scripts/gm.sh prod up
```

## Migrations
Production runs Django schema migrations via the one-off `migrate` service in `docker-compose.prod.yml`.
To rerun manually:

```bash
docker compose -f docker-compose.prod.yml run --rm migrate
```

## Optional: demo seed (staging / smoke tests)
To load the demo lecture into a fresh database:

```bash
docker compose -f docker-compose.prod.yml --profile seed run --rm seed_demo
```

Set `SEED_DEV_RENDER=0` to skip LaTeXML rendering.

## Optional: legacy import (one-time)
Legacy migration is intentionally **decoupled** from the production stack. It is meant as a one-time migration step after the app is up.

Requirements:
- `legacy/sql/legacy.sql`
- legacy lecture assets in `legacy/lectures/` (or otherwise mounted into `/app/media/lectures`)

Run the import:

```bash
./legacy/migrate.sh prod
```

## 4) Create a superuser

```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser
```

## 5) Backups
A backup script is provided in `scripts/backup.sh`. You can run it manually or add it to crontab.

```bash
# Run manually
./scripts/backup.sh

# Add to crontab (e.g. daily at 3am)
0 3 * * * /path/to/goldmine-v2/scripts/backup.sh >> /var/log/goldmine_backup.log 2>&1
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

4) Start services (`docker compose -f docker-compose.prod.yml up -d`). If the schema needs updating, rerun `docker compose -f docker-compose.prod.yml run --rm migrate`.
