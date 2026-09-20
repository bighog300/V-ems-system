#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
COMPOSE="$ROOT_DIR/infra/docker-compose.dev.yml"
DOCKERFILE="$ROOT_DIR/infra/services/api-gateway/Dockerfile"

rg -q '^  api:$' "$COMPOSE"
rg -q '"\$\{API_PORT:-3001\}:3001"' "$COMPOSE"
rg -q 'VEMS_DB_PATH: \$\{VEMS_DB_PATH:-/var/lib/vems/data/platform.sqlite\}' "$COMPOSE"
rg -q 'VEMS_DB_INIT_MODE: \$\{VEMS_DB_INIT_MODE:-existing\}' "$COMPOSE"
rg -q 'VEMS_DB_HOST_PATH:\?external development data path required' "$COMPOSE"
rg -q 'condition: service_healthy' "$COMPOSE"
rg -q 'REDIS_URL: redis://redis:6379' "$COMPOSE"
rg -q 'OPENEMR_BASE_URL: http://openemr' "$COMPOSE"
rg -q 'VTIGER_BASE_URL: http://vtiger' "$COMPOSE"
rg -q 'VTIGER_USERNAME: \$\{VTIGER_USERNAME:\?VTIGER_USERNAME is required\}' "$COMPOSE"
rg -q 'VTIGER_ACCESS_KEY: \$\{VTIGER_ACCESS_KEY:\?VTIGER_ACCESS_KEY is required\}' "$COMPOSE"
rg -q 'OPENEMR_USERNAME: \$\{OPENEMR_USERNAME:\?OPENEMR_USERNAME is required\}' "$COMPOSE"
rg -q 'VEMS_REQUIRE_EXISTING_DB: \$\{VEMS_REQUIRE_EXISTING_DB:-true\}' "$COMPOSE"
rg -q '^FROM node:22\.' "$DOCKERFILE"
rg -q '^USER node\r?$' "$DOCKERFILE"
if rg -n 'VTIGER_DB_PASSWORD:-|VTIGER_ADMIN_PASSWORD:-|JWT_HS256_SECRET:-|OPENEMR_CLIENT_SECRET:-' "$COMPOSE"; then
  echo 'Compose contains an insecure secret default.' >&2
  exit 1
fi
printf '%s\n' 'api Compose static checks: PASS'
