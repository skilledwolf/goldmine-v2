#!/bin/bash
set -e

# Pull the latest images from GHCR
docker compose -f docker-compose.prod.yml pull

# Restart services with new images
docker compose -f docker-compose.prod.yml up -d

# Prune old images to save space
docker image prune -f
