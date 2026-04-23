#!/bin/sh
set -eu

MYSQL_DATA_DIR="${MYSQL_DATA_DIR:-/var/lib/mysql}"
MYSQL_RUN_DIR="/run/mysqld"
MYSQL_SOCKET="${MYSQL_RUN_DIR}/mysqld.sock"
MYSQL_INIT_SQL="/tmp/fishfind-init.sql"
MYSQL_SCHEMA_SOURCE="/app/backend/auth.sql"
MYSQL_DATABASE_NAME="${DB_NAME:-fishfind}"
MYSQL_APP_USER="${DB_USER:-fishfind_app}"
MYSQL_APP_PASSWORD="${DB_PASSWORD:-fishfind_app_password}"

echo "[mysql-init] starting MariaDB bootstrap"
echo "[mysql-init] data dir: ${MYSQL_DATA_DIR}"
echo "[mysql-init] database: ${MYSQL_DATABASE_NAME}"
echo "[mysql-init] app user: ${MYSQL_APP_USER}"

mkdir -p "${MYSQL_RUN_DIR}" "${MYSQL_DATA_DIR}"
chown -R mysql:mysql "${MYSQL_RUN_DIR}" "${MYSQL_DATA_DIR}"

if [ ! -d "${MYSQL_DATA_DIR}/mysql" ]; then
  echo "[mysql-init] no existing system tables found, initializing database directory"
  mariadb-install-db --user=mysql --datadir="${MYSQL_DATA_DIR}" >/tmp/mariadb-install.log 2>&1
  echo "[mysql-init] mariadb-install-db completed"
else
  echo "[mysql-init] existing MariaDB data directory detected, reusing it"
fi

cat > "${MYSQL_INIT_SQL}" <<EOF
CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE_NAME}\`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE \`${MYSQL_DATABASE_NAME}\`;
CREATE USER IF NOT EXISTS '${MYSQL_APP_USER}'@'127.0.0.1' IDENTIFIED BY '${MYSQL_APP_PASSWORD}';
CREATE USER IF NOT EXISTS '${MYSQL_APP_USER}'@'localhost' IDENTIFIED BY '${MYSQL_APP_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE_NAME}\`.* TO '${MYSQL_APP_USER}'@'127.0.0.1';
GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE_NAME}\`.* TO '${MYSQL_APP_USER}'@'localhost';
FLUSH PRIVILEGES;
EOF
cat "${MYSQL_SCHEMA_SOURCE}" >> "${MYSQL_INIT_SQL}"

echo "[mysql-init] wrote init SQL to ${MYSQL_INIT_SQL}"
echo "[mysql-init] launching mariadbd on 127.0.0.1:3306"

exec mariadbd \
  --user=mysql \
  --datadir="${MYSQL_DATA_DIR}" \
  --skip-networking=0 \
  --bind-address=127.0.0.1 \
  --port=3306 \
  --socket="${MYSQL_SOCKET}" \
  --init-file="${MYSQL_INIT_SQL}" \
  --console
