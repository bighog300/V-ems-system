#!/usr/bin/env bash
# Backup platform-local SQLite state to a timestamped file.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib.sh"

ENV_NAME="${1:-development}"
load_env "$ENV_NAME"

require_command sqlite3

DB_PATH="${VEMS_DB_PATH:-.data/platform.development.sqlite}"
DB_PATH="$(realpath -m "$ROOT_DIR/$DB_PATH" 2>/dev/null || echo "$ROOT_DIR/$DB_PATH")"

BACKUP_DIR="${VEMS_BACKUP_DIR:-$ROOT_DIR/.backups}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="$BACKUP_DIR/platform-${ENV_NAME}-${TIMESTAMP}.sqlite"

if [[ ! -f "$DB_PATH" ]]; then
  echo "ERROR: Database not found at $DB_PATH" >&2
  exit 1
fi

echo "Backing up $DB_PATH -> $BACKUP_FILE"
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

BACKUP_SIZE="$(du -sh "$BACKUP_FILE" | cut -f1)"
echo "Backup complete. Size: $BACKUP_SIZE"
echo "File: $BACKUP_FILE"

# Prune old backups if BACKUP_RETAIN_DAYS is set (default: keep all)
if [[ -n "${BACKUP_RETAIN_DAYS:-}" ]]; then
  find "$BACKUP_DIR" -name "platform-${ENV_NAME}-*.sqlite" -mtime "+${BACKUP_RETAIN_DAYS}" -delete
  echo "Pruned backups older than ${BACKUP_RETAIN_DAYS} days."
fi
