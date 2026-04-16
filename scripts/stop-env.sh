#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for service in api-gateway web-control sync-worker; do
  pid_file="$ROOT_DIR/.pids/${service}.pid"
  if [[ -f "$pid_file" ]]; then
    pid="$(cat "$pid_file")"
    if kill "$pid" >/dev/null 2>&1; then
      echo "Stopped $service (pid=$pid)"
    fi
    rm -f "$pid_file"
  fi
done
