#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib.sh"

require_command node
require_command npm
require_command sqlite3

cd "$ROOT_DIR"

npm install
mkdir -p .data .pids

if [[ ! -f "$ROOT_DIR/env/development.local.env" ]]; then
  cp "$ROOT_DIR/env/development.local.env.example" "$ROOT_DIR/env/development.local.env"
fi

echo "Bootstrap complete."
