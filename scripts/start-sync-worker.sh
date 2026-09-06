#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib.sh"

ENV_NAME="${1:-development}"
_VTIGER_BASE_URL_OVERRIDE="${VTIGER_BASE_URL-}"
_VTIGER_USERNAME_OVERRIDE="${VTIGER_USERNAME-}"
_VTIGER_ACCESS_KEY_OVERRIDE="${VTIGER_ACCESS_KEY-}"
load_env "$ENV_NAME"
[[ -n "$_VTIGER_BASE_URL_OVERRIDE" ]] && export VTIGER_BASE_URL="$_VTIGER_BASE_URL_OVERRIDE"
[[ -n "$_VTIGER_USERNAME_OVERRIDE" ]] && export VTIGER_USERNAME="$_VTIGER_USERNAME_OVERRIDE"
[[ -n "$_VTIGER_ACCESS_KEY_OVERRIDE" ]] && export VTIGER_ACCESS_KEY="$_VTIGER_ACCESS_KEY_OVERRIDE"

cd "$ROOT_DIR"
npm run start:sync-worker -w @vems/orchestration
