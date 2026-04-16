#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib.sh"

ENV_NAME="${1:-development}"
load_env "$ENV_NAME"

if [[ "${SMOKE_INCLUDE_UPSTREAM_CONNECTIVITY:-false}" == "true" ]]; then
  echo "Running optional upstream connectivity checks..."
  node "$ROOT_DIR/scripts/validate-upstream-connectivity.mjs"
fi

API_PORT="${API_PORT:-8080}"
SMOKE_BASE_URL="http://localhost:${API_PORT}" node "$ROOT_DIR/scripts/smoke-test.mjs"
