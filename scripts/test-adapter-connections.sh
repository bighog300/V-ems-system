#!/usr/bin/env bash
set -euo pipefail

VTIGER_URL="${VTIGER_URL:-http://localhost:8080/}"
OPENEMR_URL="${OPENEMR_URL:-http://localhost:8081/}"

failures=0

test_url() {
  local label="$1"
  local url="$2"

  echo "Testing ${label}: ${url}"
  if curl -fsS "$url" >/dev/null 2>&1; then
    echo "✅ ${label} connection OK"
  else
    echo "❌ ${label} connection FAILED"
    failures=$((failures + 1))
  fi
  echo
}

test_url "VtigerCRM" "$VTIGER_URL"
test_url "OpenEMR" "$OPENEMR_URL"

if [[ "$failures" -eq 0 ]]; then
  echo "All adapter connection checks passed."
  exit 0
fi

echo "${failures} adapter connection check(s) failed."
exit 1
