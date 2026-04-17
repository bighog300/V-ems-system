#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib.sh"

BACKUP_FILE="${1:-}"
ENV_NAME="${2:-development}"

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "Usage: $0 <backup-file> [environment]" >&2
  exit 1
fi

load_env "$ENV_NAME"

if [[ "${DB_ENGINE:-sqlite}" == "mysql" ]]; then
  require_command mysql
  DB_HOST="${DB_HOST:-127.0.0.1}"
  DB_PORT="${DB_PORT:-3306}"
  DB_USER="${DB_USER:-root}"
  DB_PASSWORD="${DB_PASSWORD:-}"
  DB_NAME="${DB_NAME:-vems}"
  echo "Restoring MySQL backup $BACKUP_FILE -> $DB_HOST:$DB_PORT/$DB_NAME"
  mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$BACKUP_FILE"
else
  require_command sqlite3
  DB_PATH="${VEMS_DB_PATH:-.data/platform.development.sqlite}"
  DB_PATH="$(realpath -m "$ROOT_DIR/$DB_PATH" 2>/dev/null || echo "$ROOT_DIR/$DB_PATH")"

  if ! sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" | grep -q "^ok$"; then
    echo "ERROR: Backup file failed integrity check: $BACKUP_FILE" >&2
    exit 1
  fi

  mkdir -p "$(dirname "$DB_PATH")"
  sqlite3 "$BACKUP_FILE" ".backup '$DB_PATH'"
fi

echo "Restore complete."
