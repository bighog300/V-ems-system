#!/usr/bin/env bash
set -euo pipefail

DB_HOST="${DB_HOST:-mysql}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-vtiger}"
DB_USER="${DB_USER:-vtiger}"
DB_PASSWORD="${DB_PASSWORD:-vtigerpass}"
DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:-}"
MAX_ATTEMPTS="${DB_WAIT_ATTEMPTS:-60}"
SLEEP_SECONDS="${DB_WAIT_SLEEP_SECONDS:-2}"

log() {
  echo "[vems-vtiger-db-init] $*"
}

if [ -n "${DB_ROOT_PASSWORD}" ]; then
  MYSQL_AUTH=(-uroot "-p${DB_ROOT_PASSWORD}")
  MYSQLADMIN_AUTH=(-uroot "-p${DB_ROOT_PASSWORD}")
  DB_ACTOR="root"
else
  MYSQL_AUTH=(-u"${DB_USER}" "-p${DB_PASSWORD}")
  MYSQLADMIN_AUTH=(-u"${DB_USER}" "-p${DB_PASSWORD}")
  DB_ACTOR="${DB_USER}"
  log "DB_ROOT_PASSWORD is not set; using application DB user for readiness and DB checks."
fi

attempt=1
log "Waiting for MySQL at ${DB_HOST}:${DB_PORT} as ${DB_ACTOR}."
until mysqladmin ping -h"${DB_HOST}" -P"${DB_PORT}" "${MYSQLADMIN_AUTH[@]}" --silent >/dev/null 2>&1; do
  if [ "${attempt}" -ge "${MAX_ATTEMPTS}" ]; then
    log "FATAL: MySQL did not become ready after ${MAX_ATTEMPTS} attempts."
    exit 1
  fi
  log "MySQL not ready yet (attempt ${attempt}/${MAX_ATTEMPTS}); retrying in ${SLEEP_SECONDS}s."
  attempt=$((attempt + 1))
  sleep "${SLEEP_SECONDS}"
done
log "MySQL is reachable."

log "Ensuring database '${DB_NAME}' exists."
mysql -h"${DB_HOST}" -P"${DB_PORT}" "${MYSQL_AUTH[@]}" -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

if [ -n "${DB_ROOT_PASSWORD}" ] && [ "${DB_USER}" != "root" ]; then
  log "Ensuring database user '${DB_USER}' exists and has privileges on '${DB_NAME}'."
  mysql -h"${DB_HOST}" -P"${DB_PORT}" "${MYSQL_AUTH[@]}" <<SQL
CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'%';
FLUSH PRIVILEGES;
SQL
else
  log "Skipping DB user create/grant step (root password unavailable or DB_USER is root)."
fi

TABLE_COUNT="$(mysql -N -s -h"${DB_HOST}" -P"${DB_PORT}" "${MYSQL_AUTH[@]}" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}';")"
log "Database '${DB_NAME}' currently has ${TABLE_COUNT} table(s)."
log "Database readiness and existence checks complete."
