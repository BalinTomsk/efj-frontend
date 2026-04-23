#!/bin/sh
set -eu

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-fishfind_app}"
DB_PASSWORD="${DB_PASSWORD:-fishfind_app_password}"

echo "[backend-init] waiting for MySQL at ${DB_HOST}:${DB_PORT} as ${DB_USER}"
until mariadb-admin ping \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --password="${DB_PASSWORD}" \
  --silent; do
  echo "[backend-init] MySQL not ready yet, retrying in 1s"
  sleep 1
done

echo "[backend-init] MySQL is ready"
echo "[backend-init] starting node /app/backend/server.js"
exec node /app/backend/server.js
