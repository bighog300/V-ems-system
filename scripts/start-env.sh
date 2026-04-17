#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib.sh"

ENV_NAME="${1:-development}"
ENV_FILE="$ROOT_DIR/infra/.env.${ENV_NAME}"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$ROOT_DIR/infra/.env" ]]; then
    ENV_FILE="$ROOT_DIR/infra/.env"
  else
    echo "Missing environment file: $ROOT_DIR/infra/.env.${ENV_NAME} (or infra/.env fallback)" >&2
    exit 1
  fi
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

validate_required_runtime_secrets

mkdir -p "$ROOT_DIR/.pids" "$ROOT_DIR/.logs"

COMPOSE_FILE="$ROOT_DIR/infra/docker-compose.dev.yml"
if [[ "$ENV_NAME" == "staging" ]]; then
  COMPOSE_FILE="$ROOT_DIR/infra/docker-compose.staging.yml"
fi

echo "🐳 Starting Docker services for ${ENV_NAME}..."
docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

echo "⏳ Waiting for MySQL readiness..."
attempt=1
max_attempts=60
MYSQL_CONTAINER="vems-mysql-dev"
if [[ "$ENV_NAME" == "staging" ]]; then
  MYSQL_CONTAINER="vems-mysql-staging"
fi

while ! docker exec "$MYSQL_CONTAINER" mysqladmin ping -h localhost --silent >/dev/null 2>&1; do
  if (( attempt >= max_attempts )); then
    echo "MySQL did not become ready within expected time." >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 1
done

sleep 10

load_env "$ENV_NAME"

nohup "$ROOT_DIR/scripts/start-api.sh" "$ENV_NAME" >"$ROOT_DIR/.logs/api-gateway.log" 2>&1 &
echo $! > "$ROOT_DIR/.pids/api-gateway.pid"

nohup "$ROOT_DIR/scripts/start-web-control.sh" "$ENV_NAME" >"$ROOT_DIR/.logs/web-control.log" 2>&1 &
echo $! > "$ROOT_DIR/.pids/web-control.pid"

nohup "$ROOT_DIR/scripts/start-sync-worker.sh" "$ENV_NAME" >"$ROOT_DIR/.logs/sync-worker.log" 2>&1 &
echo $! > "$ROOT_DIR/.pids/sync-worker.pid"

"$ROOT_DIR/scripts/health-check.sh" || true

echo "✅ Environment started for '$ENV_NAME'."
echo "API Gateway: http://localhost:${API_PORT:-3000}"
echo "VtigerCRM:  http://localhost:${VTIGER_PORT:-8080}"
echo "OpenEMR:    http://localhost:${OPENEMR_PORT:-8081}"
echo "Logs:       $ROOT_DIR/.logs"
echo "PIDs:       $ROOT_DIR/.pids"
