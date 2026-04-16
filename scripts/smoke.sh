#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib.sh"

ENV_NAME="${1:-development}"
load_env "$ENV_NAME"

API_PORT="${API_PORT:-8080}"
API_HEALTH_URL="http://localhost:${API_PORT}/health"
SMOKE_READY_TIMEOUT_SECONDS="${SMOKE_READY_TIMEOUT_SECONDS:-60}"
SMOKE_READY_POLL_SECONDS="${SMOKE_READY_POLL_SECONDS:-1}"

if ! wait_for_http_ready "$API_HEALTH_URL" "API Gateway" "$SMOKE_READY_TIMEOUT_SECONDS" "$SMOKE_READY_POLL_SECONDS"; then
  echo "Smoke aborted: API Gateway was not ready. Check logs at $ROOT_DIR/.logs/api-gateway.log" >&2
  exit 1
fi

if [[ "${SMOKE_INCLUDE_UPSTREAM_CONNECTIVITY:-false}" == "true" ]]; then
  echo "Running optional upstream connectivity checks..."
  node "$ROOT_DIR/scripts/validate-upstream-connectivity.mjs"
fi

SMOKE_BASE_URL="http://localhost:${API_PORT}" node "$ROOT_DIR/scripts/smoke-test.mjs"
