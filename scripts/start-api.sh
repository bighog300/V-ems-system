#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib.sh"

ENV_NAME="${1:-development}"
load_env "$ENV_NAME"

if [[ "${2:-}" == "--app-only" ]]; then
  # Explicit offline baseline: leave real transports unconfigured. No env file
  # is rewritten and no upstream authentication checks are weakened.
  export OPENEMR_BASE_URL="" VTIGER_BASE_URL=""
fi

cd "$ROOT_DIR"
PORT="${API_PORT:-8080}" npm run start -w @vems/api-gateway
