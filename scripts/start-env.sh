#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib.sh"

ENV_NAME="${1:-development}"
load_env "$ENV_NAME"

mkdir -p "$ROOT_DIR/.pids" "$ROOT_DIR/.logs"

"$ROOT_DIR/scripts/init-db.sh" "$ENV_NAME"

nohup "$ROOT_DIR/scripts/start-api.sh" "$ENV_NAME" >"$ROOT_DIR/.logs/api-gateway.log" 2>&1 &
echo $! > "$ROOT_DIR/.pids/api-gateway.pid"

nohup "$ROOT_DIR/scripts/start-web-control.sh" "$ENV_NAME" >"$ROOT_DIR/.logs/web-control.log" 2>&1 &
echo $! > "$ROOT_DIR/.pids/web-control.pid"

nohup "$ROOT_DIR/scripts/start-sync-worker.sh" "$ENV_NAME" >"$ROOT_DIR/.logs/sync-worker.log" 2>&1 &
echo $! > "$ROOT_DIR/.pids/sync-worker.pid"

echo "Environment started for '$ENV_NAME'."
echo "API: http://localhost:${API_PORT:-8080}"
echo "Web: http://localhost:${WEB_PORT:-4173}"
echo "Logs: $ROOT_DIR/.logs"
