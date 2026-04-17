#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/var/www/html"
DIST_ROOT="/opt/vtiger-dist"
MARKER_FILE="${APP_ROOT}/.vems-initialized"
TEMPLATE_FILE="/opt/vems/templates/config.inc.php.tpl"

log() {
  echo "[vems-vtiger-entrypoint] $*"
}

is_app_root_uninitialized() {
  if [ ! -d "${APP_ROOT}" ]; then
    return 0
  fi

  if [ -z "$(find "${APP_ROOT}" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
    return 0
  fi

  if [ ! -f "${APP_ROOT}/index.php" ] || [ ! -f "${APP_ROOT}/composer.json" ]; then
    return 0
  fi

  return 1
}

if [ ! -f "${MARKER_FILE}" ]; then
  if is_app_root_uninitialized; then
    log "First boot detected with empty or uninitialized app volume; syncing pristine app into ${APP_ROOT}."
    mkdir -p "${APP_ROOT}"
    rsync -a --delete "${DIST_ROOT}/" "${APP_ROOT}/"
  else
    log "First boot marker missing, but app root already looks populated; preserving existing files."
  fi
else
  log "Initialization marker found; skipping app distribution sync."
fi

cd "${APP_ROOT}"

if [ -f composer.json ] && [ ! -f vendor/autoload.php ]; then
  log "vendor/autoload.php missing; installing Composer dependencies."
  composer install --no-interaction --prefer-dist
else
  log "Composer dependencies already present or composer.json missing; skipping Composer install."
fi

WRITABLE_DIRS=(
  cache
  cache/images
  cache/import
  storage
  user_privileges
  logs
  cron/modules
  test/vtlib/HTML
  test/wordtemplatedownload
  test/product
  test/user
  test/contact
  test/logo
)

for dir in "${WRITABLE_DIRS[@]}"; do
  mkdir -p "${APP_ROOT}/${dir}"
done

touch "${APP_ROOT}/config.inc.php" "${APP_ROOT}/tabdata.php" "${APP_ROOT}/parent_tabdata.php"

for dir in "${WRITABLE_DIRS[@]}"; do
  chown -R www-data:www-data "${APP_ROOT}/${dir}"
  chmod 775 "${APP_ROOT}/${dir}"
done

chown www-data:www-data "${APP_ROOT}/config.inc.php" "${APP_ROOT}/tabdata.php" "${APP_ROOT}/parent_tabdata.php"
chmod 664 "${APP_ROOT}/config.inc.php" "${APP_ROOT}/tabdata.php" "${APP_ROOT}/parent_tabdata.php"

/opt/vems/init-scripts/init-vtiger.sh

if [ ! -f "${MARKER_FILE}" ]; then
  log "Running first-boot one-time initialization tasks."

  : "${DB_HOST:=mysql}"
  : "${DB_PORT:=3306}"
  : "${DB_NAME:=vtiger}"
  : "${DB_USER:=vtiger}"
  : "${DB_PASSWORD:=vtigerpass}"
  : "${VTIGER_SITE_URL:=http://localhost:8080}"
  : "${VTIGER_ADMIN_USER:=admin}"
  : "${VTIGER_ADMIN_PASSWORD:=Admin@123}"
  : "${VTIGER_ADMIN_EMAIL:=admin@example.com}"
  : "${VTIGER_COMPANY_NAME:=VEMS Dev}"
  : "${VTIGER_TIMEZONE:=UTC}"
  : "${VTIGER_CURRENCY:=USD}"
  : "${VTIGER_LANGUAGE:=en_us}"

  export DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD
  export VTIGER_SITE_URL VTIGER_ADMIN_USER VTIGER_ADMIN_PASSWORD
  export VTIGER_ADMIN_EMAIL VTIGER_COMPANY_NAME VTIGER_TIMEZONE
  export VTIGER_CURRENCY VTIGER_LANGUAGE

  if [ -f "${TEMPLATE_FILE}" ]; then
    log "Rendering config.inc.php from template ${TEMPLATE_FILE}."
    envsubst < "${TEMPLATE_FILE}" > "${APP_ROOT}/config.inc.php"
    chown www-data:www-data "${APP_ROOT}/config.inc.php"
    chmod 664 "${APP_ROOT}/config.inc.php"
  else
    log "ERROR: Missing config template ${TEMPLATE_FILE}."
    exit 1
  fi

  /opt/vems/init-scripts/install-vtiger.sh

  touch "${MARKER_FILE}"
  chown www-data:www-data "${MARKER_FILE}"
  log "Initialization marker created at ${MARKER_FILE}."
else
  log "Skipping one-time initialization tasks; marker already present."
fi

if command -v apache2-foreground >/dev/null 2>&1; then
  log "Starting Apache using apache2-foreground."
  exec apache2-foreground
elif command -v httpd >/dev/null 2>&1; then
  log "Starting Apache using httpd -D FOREGROUND."
  exec httpd -D FOREGROUND
elif command -v apachectl >/dev/null 2>&1; then
  log "Starting Apache using apachectl -D FOREGROUND."
  exec apachectl -D FOREGROUND
else
  log "ERROR: No supported Apache foreground command found (apache2-foreground/httpd/apachectl)."
  exit 127
fi
