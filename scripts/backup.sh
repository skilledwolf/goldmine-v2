#!/bin/bash
set -e

# Load env vars if present (simple sourcing)
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="$BACKUP_DIR/goldmine_backup_$TIMESTAMP.sql.gz"

echo "Backing up database to $FILENAME..."

docker compose -f docker-compose.prod.yml exec -T db pg_dump -U "${POSTGRES_USER:-goldmine_user}" "${POSTGRES_DB:-goldmine_v2}" | gzip > "$FILENAME"

echo "Backup complete: $FILENAME"

# Optional: keep only last 7 days
find "$BACKUP_DIR" -name "goldmine_backup_*.sql.gz" -mtime +7 -delete
