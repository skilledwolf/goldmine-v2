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
