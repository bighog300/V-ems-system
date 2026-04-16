#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib.sh"

ENV_NAME="${1:-development}"
load_env "$ENV_NAME"

cd "$ROOT_DIR"
node --input-type=module <<'NODE'
import { SqliteClient } from "./services/orchestration/src/db.mjs";

const dbPath = process.env.VEMS_DB_PATH;
new SqliteClient(dbPath);
console.log(`Initialized sqlite database at ${dbPath}`);
NODE
