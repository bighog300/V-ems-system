#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib.sh"

ENV_NAME="${1:-development}"
START_MODE="${2:-full}"
if [[ "$START_MODE" != "full" && "$START_MODE" != "--app-only" ]]; then
  echo "Usage: $0 [development|staging] [--app-only]" >&2
  exit 1
fi
if [[ "$START_MODE" == "--app-only" && "$ENV_NAME" != "development" ]]; then
  echo "--app-only is only supported for development." >&2
  exit 1
fi

if [[ "$START_MODE" == "full" ]]; then
  ENV_FILE="$ROOT_DIR/infra/.env.${ENV_NAME}"

  if [[ ! -f "$ENV_FILE" ]]; then
    if [[ -f "$ROOT_DIR/infra/.env" ]]; then
      ENV_FILE="$ROOT_DIR/infra/.env"
    else
      echo "Missing environment file: $ROOT_DIR/infra/.env.${ENV_NAME} (or infra/.env fallback)" >&2
      exit 1
    fi
  fi

  # Compose env files contain dotenv data, not shell commands (values may contain
  # spaces). Transfer parsed assignments without evaluating or printing values.
  while IFS= read -r -d '' assignment; do
    export "$assignment"
  done < <(node --input-type=module - "$ENV_FILE" <<'NODE'
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
for (const [key, value] of Object.entries(parseEnv(readFileSync(process.argv[2], 'utf8')))) {
  process.stdout.write(`${key}=${value}\0`);
}
NODE
  )

  load_env "$ENV_NAME"

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
fi

load_env "$ENV_NAME"
mkdir -p "$ROOT_DIR/.pids" "$ROOT_DIR/.logs"

nohup "$ROOT_DIR/scripts/start-api.sh" "$ENV_NAME" "$START_MODE" >"$ROOT_DIR/.logs/api-gateway.log" 2>&1 &
echo $! > "$ROOT_DIR/.pids/api-gateway.pid"

if ! http_endpoint_ready "http://localhost:${WEB_PORT:-4173}/"; then
  nohup "$ROOT_DIR/scripts/start-web-control.sh" "$ENV_NAME" >"$ROOT_DIR/.logs/web-control.log" 2>&1 &
  echo $! > "$ROOT_DIR/.pids/web-control.pid"
fi

if [[ "$START_MODE" == "full" ]]; then
  nohup "$ROOT_DIR/scripts/start-sync-worker.sh" "$ENV_NAME" >"$ROOT_DIR/.logs/sync-worker.log" 2>&1 &
  echo $! > "$ROOT_DIR/.pids/sync-worker.pid"
fi

wait_for_http_ready "http://localhost:${API_PORT:-8080}/health" "API Gateway" 60 1
wait_for_http_ready "http://localhost:${WEB_PORT:-4173}/" "Web control" 60 1

if [[ "$START_MODE" == "full" ]]; then
  "$ROOT_DIR/scripts/health-check.sh"
fi

echo "✅ Environment started for '$ENV_NAME'."
echo "API Gateway: http://localhost:${API_PORT:-8080}"
if [[ "$START_MODE" == "full" ]]; then
  echo "VtigerCRM:  http://localhost:${VTIGER_PORT:-8080}"
  echo "OpenEMR:    http://localhost:${OPENEMR_PORT:-8081}"
fi
echo "Logs:       $ROOT_DIR/.logs"
echo "PIDs:       $ROOT_DIR/.pids"
