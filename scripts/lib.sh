#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

resolve_env_file() {
  local env_name="${1:-development}"
  echo "$ROOT_DIR/env/${env_name}.env"
}

load_env() {
  local env_name="${1:-development}"
  local env_file
  env_file="$(resolve_env_file "$env_name")"

  if [[ ! -f "$env_file" ]]; then
    echo "Missing environment file: $env_file" >&2
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  source "$env_file"

  local local_override="$ROOT_DIR/env/${env_name}.local.env"
  if [[ -f "$local_override" ]]; then
    # shellcheck disable=SC1090
    source "$local_override"
  fi
  set +a
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name" >&2
    exit 1
  fi
}
