#!/usr/bin/env bash
# install-vtiger.sh
#
# First-boot installer for vtiger CRM 8.3.0.
# Called by entrypoint.sh after:
#   - app root is synced from dist
#   - config.inc.php has been rendered from the template
#   - MySQL is reachable and the database/user exist (init-vtiger.sh)
#
# Responsibilities:
#   1. Short-circuit if the schema is already present (idempotency).
#   2. Apply a full schema dump from seed-data.sql if one is present (DDL path).
#   3. Otherwise invoke the PHP CLI headless installer driver
#      (vtiger-install-cli.php) which bootstraps vtiger's own installer
#      classes to create the schema and admin user without a browser.
#   4. Apply any post-install seed data from seed-data.sql (DML-only path).
#
set -euo pipefail

DB_HOST="${DB_HOST:-mysql}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-vtiger}"
DB_USER="${DB_USER:-vtiger}"
DB_PASSWORD="${DB_PASSWORD:-vtigerpass}"
DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:-}"

APP_ROOT="/var/www/html"
SEED_SQL_PATH="/opt/vems/init-scripts/seed-data.sql"
CLI_INSTALLER="/opt/vems/init-scripts/vtiger-install-cli.php"

log() {
  echo "[vems-vtiger-install] $*"
}

# ---------------------------------------------------------------------------
# MySQL auth: prefer root for wider visibility; fall back to app user
# ---------------------------------------------------------------------------
if [ -n "${DB_ROOT_PASSWORD}" ]; then
  MYSQL_AUTH=(-uroot "-p${DB_ROOT_PASSWORD}")
  DB_ACTOR="root"
else
  MYSQL_AUTH=(-u"${DB_USER}" "-p${DB_PASSWORD}")
  DB_ACTOR="${DB_USER}"
fi

# ---------------------------------------------------------------------------
# Idempotency: skip everything if core vtiger tables already exist
# ---------------------------------------------------------------------------
log "Inspecting database '${DB_NAME}' for existing vtiger install (as ${DB_ACTOR})."
EXISTING_CORE_TABLES="$(
  mysql -N -s \
    -h"${DB_HOST}" -P"${DB_PORT}" "${MYSQL_AUTH[@]}" \
    -e "SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema='${DB_NAME}'
          AND table_name IN ('vtiger_users','vtiger_tab','vtiger_version');"
)"

if [ "${EXISTING_CORE_TABLES}" -ge 2 ]; then
  log "Existing vtiger core tables detected (${EXISTING_CORE_TABLES}); bootstrap already complete."
  exit 0
fi

log "Core tables not found (${EXISTING_CORE_TABLES}). Proceeding with first-run install."

# ---------------------------------------------------------------------------
# Path A: Full schema dump in seed-data.sql (DDL present)
# Drop a pre-built mysqldump of vtiger 8.3.0 at seed-data.sql to use this
# faster path which skips the PHP installer entirely.
# ---------------------------------------------------------------------------
if [ -f "${SEED_SQL_PATH}" ] && grep -qiE '^CREATE TABLE' "${SEED_SQL_PATH}"; then
  log "Full schema dump detected at ${SEED_SQL_PATH}; applying..."
  mysql -h"${DB_HOST}" -P"${DB_PORT}" "${MYSQL_AUTH[@]}" "${DB_NAME}" < "${SEED_SQL_PATH}"

  POST_DDL_TABLES="$(
    mysql -N -s \
      -h"${DB_HOST}" -P"${DB_PORT}" "${MYSQL_AUTH[@]}" \
      -e "SELECT COUNT(*) FROM information_schema.tables
          WHERE table_schema='${DB_NAME}'
            AND table_name IN ('vtiger_users','vtiger_tab','vtiger_version');"
  )"
  if [ "${POST_DDL_TABLES}" -ge 2 ]; then
    log "Schema dump applied successfully (${POST_DDL_TABLES} core tables present). Done."
    exit 0
  else
    log "WARNING: Schema dump applied but core tables still missing; falling through to CLI installer."
  fi
fi

# ---------------------------------------------------------------------------
# Path B: PHP CLI headless installer
# Drives vtiger's own Installer class without a browser or running Apache.
# PHP + mysqli must be available in the image (they are in vtigercrm-8.3.0).
# ---------------------------------------------------------------------------
log "Invoking PHP CLI headless installer (vtiger-install-cli.php)..."

if [ ! -f "${CLI_INSTALLER}" ]; then
  log "ERROR: ${CLI_INSTALLER} not found."
  log "Ensure vtiger-install-cli.php is COPY'd into the image by the Dockerfile."
  exit 1
fi

if ! command -v php >/dev/null 2>&1; then
  log "ERROR: php binary not found in PATH. Cannot run headless installer."
  exit 1
fi

# Run from app root so vtiger's relative includes resolve correctly.
cd "${APP_ROOT}"

# Re-export all vars the PHP script reads from getenv() — entrypoint.sh
# already exports most of these, but we guard here for standalone runs.
export DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD
export VTIGER_ADMIN_USER VTIGER_ADMIN_PASSWORD VTIGER_ADMIN_EMAIL
export VTIGER_SITE_URL VTIGER_TIMEZONE VTIGER_LANGUAGE VTIGER_CURRENCY VTIGER_COMPANY_NAME

log "php -f ${CLI_INSTALLER}  [cwd=${APP_ROOT}]"
if php -f "${CLI_INSTALLER}"; then
  log "PHP CLI installer finished successfully."
else
  PHP_EXIT=$?
  log "ERROR: PHP CLI installer exited with code ${PHP_EXIT}."
  log "Scroll up for PHP error output."
  log "Manual debug: docker exec <container> bash -c 'cd /var/www/html && php -f ${CLI_INSTALLER}'"
  exit "${PHP_EXIT}"
fi

# ---------------------------------------------------------------------------
# Path C: Post-install DML seed data
# If seed-data.sql exists but contains only DML (no CREATE TABLE), apply it
# now as post-install test/lookup data.
# ---------------------------------------------------------------------------
if [ -f "${SEED_SQL_PATH}" ] && ! grep -qiE '^CREATE TABLE' "${SEED_SQL_PATH}"; then
  if grep -qiE '^(INSERT|UPDATE|REPLACE|CALL)' "${SEED_SQL_PATH}"; then
    log "Applying post-install seed data from ${SEED_SQL_PATH}..."
    if mysql -h"${DB_HOST}" -P"${DB_PORT}" "${MYSQL_AUTH[@]}" "${DB_NAME}" < "${SEED_SQL_PATH}"; then
      log "Post-install seed data applied."
    else
      log "WARNING: Post-install seed data failed (non-fatal; continuing)."
    fi
  else
    log "seed-data.sql has no DML statements; skipping post-install seed."
  fi
fi

log "install-vtiger.sh complete."
