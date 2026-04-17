#!/usr/bin/env bash
set -euo pipefail

DB_HOST="${DB_HOST:-mysql}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-vtiger}"
DB_USER="${DB_USER:-vtiger}"
DB_PASSWORD="${DB_PASSWORD:-vtigerpass}"
DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:-}"
SEED_SQL_PATH="/opt/vems/init-scripts/seed-data.sql"

log() {
  echo "[vems-vtiger-install] $*"
}

if [ -n "${DB_ROOT_PASSWORD}" ]; then
  MYSQL_AUTH=(-uroot "-p${DB_ROOT_PASSWORD}")
  DB_ACTOR="root"
else
  MYSQL_AUTH=(-u"${DB_USER}" "-p${DB_PASSWORD}")
  DB_ACTOR="${DB_USER}"
fi

log "Inspecting database '${DB_NAME}' for existing Vtiger install as ${DB_ACTOR}."
EXISTING_CORE_TABLES="$(mysql -N -s -h"${DB_HOST}" -P"${DB_PORT}" "${MYSQL_AUTH[@]}" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}' AND table_name IN ('vtiger_users','vtiger_tab','vtiger_version');")"

if [ "${EXISTING_CORE_TABLES}" -ge 2 ]; then
  log "Detected existing Vtiger core tables (${EXISTING_CORE_TABLES}); bootstrap already complete."
  exit 0
fi

if [ -f "${SEED_SQL_PATH}" ] && grep -qiE '^CREATE TABLE' "${SEED_SQL_PATH}"; then
  log "Applying schema/data seed from ${SEED_SQL_PATH}."
  mysql -h"${DB_HOST}" -P"${DB_PORT}" "${MYSQL_AUTH[@]}" "${DB_NAME}" < "${SEED_SQL_PATH}"

  POST_IMPORT_CORE_TABLES="$(mysql -N -s -h"${DB_HOST}" -P"${DB_PORT}" "${MYSQL_AUTH[@]}" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}' AND table_name IN ('vtiger_users','vtiger_tab','vtiger_version');")"
  if [ "${POST_IMPORT_CORE_TABLES}" -ge 2 ]; then
    log "Seed import completed and Vtiger tables detected (${POST_IMPORT_CORE_TABLES})."
  else
    log "WARNING: Seed import ran, but core Vtiger tables are still not fully present."
  fi
  exit 0
fi

log "No full version-matched Vtiger schema seed found at ${SEED_SQL_PATH}."
log "TODO: add automated first-run installer invocation or provide full vtiger 8.3.0 schema dump for import."
log "Continuing startup without failing container to preserve developer workflow."
