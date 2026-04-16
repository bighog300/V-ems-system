#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib.sh"

ENV_NAME="${1:-development}"
load_env "$ENV_NAME"

cd "$ROOT_DIR"
npm run start:sync-worker -w @vems/orchestration
