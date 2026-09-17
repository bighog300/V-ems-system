#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
CONFIG="$ROOT_DIR/infra/services/openemr/config/openemr.conf.php"

grep -F '$sqlconf = [' "$CONFIG" >/dev/null
grep -F '$config = 0;' "$CONFIG" >/dev/null
grep -F "required('MYSQL_USER')" "$CONFIG" >/dev/null
grep -F "required('MYSQL_PASSWORD')" "$CONFIG" >/dev/null
grep -F "'host' => getenv('MYSQL_HOST') ?: 'mysql'" "$CONFIG" >/dev/null
grep -F 'OPENEMR_SETTING_rest_api: "1"' "$ROOT_DIR/infra/docker-compose.dev.yml" >/dev/null
grep -F 'OPENEMR_SETTING_rest_fhir_api: "1"' "$ROOT_DIR/infra/docker-compose.dev.yml" >/dev/null
grep -F 'OPENEMR_SETTING_oauth_password_grant: "1"' "$ROOT_DIR/infra/docker-compose.dev.yml" >/dev/null
grep -F 'chown apache:apache /var/www/localhost/htdocs/openemr/sites/default/sqlconf.php' "$ROOT_DIR/infra/services/openemr/Dockerfile" >/dev/null
SQLCONF_PATH='/var/www/localhost/htdocs/openemr/sites/default/sqlconf.php'
mode_line="$(grep -E "chmod [0-7]{3,4} ${SQLCONF_PATH//\//\\/}" "$ROOT_DIR/infra/services/openemr/Dockerfile")"
secure_mode="$(printf '%s\n' "$mode_line" | sed -E 's/.*chmod ([0-7]{3,4}).*/\1/')"
case "$secure_mode" in
  0600|600|0660|660) ;;
  *)
    echo "sqlconf.php requires owner-only or owner/group mode, got $secure_mode" >&2
    exit 1
    ;;
esac
mode3="${secure_mode: -3}"
other_bits="${mode3:2:1}"
case "$other_bits" in
  2|3|6|7)
    echo "sqlconf.php must not be world-writable (mode $secure_mode)" >&2
    exit 1
    ;;
esac
if grep -F 'chmod 0666 /var/www/localhost/htdocs/openemr/sites/default/sqlconf.php' "$ROOT_DIR/infra/services/openemr/Dockerfile" >/dev/null; then
  echo 'world-writable sqlconf.php mode remains' >&2
  exit 1
fi
if grep -F 'Placeholder OpenEMR SQL configuration' "$CONFIG" >/dev/null; then
  echo 'placeholder OpenEMR SQL configuration remains' >&2
  exit 1
fi
if grep -E "['\"]pass['\"][[:space:]]*=>[[:space:]]*['\"][^$]" "$CONFIG" >/dev/null; then
  echo 'hard-coded OpenEMR database password remains' >&2
  exit 1
fi

echo 'OpenEMR sqlconf regression passed.'
