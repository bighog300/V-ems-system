#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib.sh"

ENV_NAME="${1:-development}"
load_env "$ENV_NAME"
validate_required_runtime_secrets

BACKUP_DIR="${VEMS_BACKUP_DIR:-$ROOT_DIR/.backups}"
mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ "${DB_ENGINE:-sqlite}" == "mysql" ]]; then
  require_command mysqldump
  DB_HOST="${DB_HOST:-127.0.0.1}"
  DB_PORT="${DB_PORT:-3306}"
  DB_USER="${DB_USER:-root}"
  DB_PASSWORD="${DB_PASSWORD:-}"
  DB_NAME="${DB_NAME:-vems}"
  BACKUP_FILE="$BACKUP_DIR/mysql-${ENV_NAME}-${TIMESTAMP}.sql"
  echo "Backing up MySQL $DB_HOST:$DB_PORT/$DB_NAME -> $BACKUP_FILE"
  mysqldump -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" --single-transaction --routines --triggers "$DB_NAME" > "$BACKUP_FILE"
else
  require_command sqlite3
  DB_PATH="${VEMS_DB_PATH:-.data/platform.development.sqlite}"
  DB_PATH="$(realpath -m "$ROOT_DIR/$DB_PATH" 2>/dev/null || echo "$ROOT_DIR/$DB_PATH")"
  BACKUP_FILE="$BACKUP_DIR/platform-${ENV_NAME}-${TIMESTAMP}.sqlite"

  if [[ ! -f "$DB_PATH" ]]; then
    echo "ERROR: Database not found at $DB_PATH" >&2
    exit 1
  fi

  echo "Backing up $DB_PATH -> $BACKUP_FILE"
  sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
fi

echo "Backup complete: $BACKUP_FILE"
