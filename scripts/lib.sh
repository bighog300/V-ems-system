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

http_endpoint_ready() {
  local url="$1"
  local request_timeout_seconds="${2:-2}"

  if command -v curl >/dev/null 2>&1; then
    curl --silent --show-error --fail --max-time "$request_timeout_seconds" "$url" >/dev/null 2>&1
    return $?
  fi

  node -e '
const url = process.argv[1];
const timeoutMs = Number(process.argv[2]) * 1000;
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

fetch(url, { method: "GET", signal: controller.signal })
  .then((response) => {
    clearTimeout(timer);
    process.exit(response.ok ? 0 : 1);
  })
  .catch(() => {
    clearTimeout(timer);
    process.exit(1);
  });
' "$url" "$request_timeout_seconds" >/dev/null 2>&1
}

wait_for_http_ready() {
  local url="$1"
  local service_name="${2:-service}"
  local timeout_seconds="${3:-60}"
  local poll_interval_seconds="${4:-1}"

  local started_at="$SECONDS"
  echo "Waiting for $service_name readiness at $url (timeout: ${timeout_seconds}s)..."

  while true; do
    if http_endpoint_ready "$url"; then
      local elapsed="$((SECONDS - started_at))"
      echo "$service_name is ready after ${elapsed}s."
      return 0
    fi

    local elapsed="$((SECONDS - started_at))"
    if (( elapsed >= timeout_seconds )); then
      echo "Timed out waiting for $service_name readiness at $url after ${timeout_seconds}s." >&2
      return 1
    fi

    sleep "$poll_interval_seconds"
  done
}


require_non_placeholder_env() {
  local variable_name="$1"
  local value="${!variable_name:-}"

  if [[ -z "$value" || "$value" == "__set_in_local_env__" ]]; then
    echo "Missing required secret: ${variable_name}. Set it in env/<environment>.local.env or the environment." >&2
    exit 1
  fi
}

validate_required_runtime_secrets() {
  for required_var in DB_ROOT_PASSWORD VTIGER_DB_PASSWORD VTIGER_ADMIN_PASSWORD OPENEMR_DB_PASSWORD OPENEMR_ADMIN_PASSWORD; do
    require_non_placeholder_env "$required_var"
  done
}
