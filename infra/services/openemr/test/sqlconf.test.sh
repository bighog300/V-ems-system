#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
CONFIG="$ROOT_DIR/infra/services/openemr/config/openemr.conf.php"
COMPOSE="$ROOT_DIR/infra/docker-compose.dev.yml"
DOCKERFILE="$ROOT_DIR/infra/services/openemr/Dockerfile"

grep -F '$sqlconf = [' "$CONFIG" >/dev/null
grep -F '$config = 0;' "$CONFIG" >/dev/null
grep -F "required('MYSQL_USER')" "$CONFIG" >/dev/null
grep -F "required('MYSQL_PASSWORD')" "$CONFIG" >/dev/null
grep -F "'host' => getenv('MYSQL_HOST') ?: 'mysql'" "$CONFIG" >/dev/null

# The development bootstrap needs REST + OAuth password grant only; FHIR stays disabled.
grep -F 'OPENEMR_SETTING_rest_api: "1"' "$COMPOSE" >/dev/null
grep -F 'OPENEMR_SETTING_rest_fhir_api: "0"' "$COMPOSE" >/dev/null
grep -F 'OPENEMR_SETTING_oauth_password_grant: "1"' "$COMPOSE" >/dev/null

# The development image preserves the upstream auto-installer, which writes sqlconf.php
# itself with the ownership and mode the upstream entrypoint expects. The image must
# neither ship a static sqlconf.php nor loosen its permissions.
if grep -E 'COPY[[:space:]].*sqlconf' "$DOCKERFILE" >/dev/null; then
  echo 'a static sqlconf.php must not be copied into the development image' >&2
  exit 1
fi
if grep -E 'chmod[[:space:]]+(-R[[:space:]]+)?0?[0-7]*[2367][[:space:]].*sqlconf' "$DOCKERFILE" >/dev/null; then
  echo 'sqlconf.php must not be made world-writable' >&2
  exit 1
fi
grep -E '^FROM openemr/openemr:[0-9.]+@sha256:[0-9a-f]{64}' "$DOCKERFILE" >/dev/null

if grep -F 'Placeholder OpenEMR SQL configuration' "$CONFIG" >/dev/null; then
  echo 'placeholder OpenEMR SQL configuration remains' >&2
  exit 1
fi
if grep -E "['\"]pass['\"][[:space:]]*=>[[:space:]]*['\"][^$]" "$CONFIG" >/dev/null; then
  echo 'hard-coded OpenEMR database password remains' >&2
  exit 1
fi

echo 'OpenEMR sqlconf regression passed.'
