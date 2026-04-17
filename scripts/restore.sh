#!/usr/bin/env bash
# Restore platform SQLite state from a backup file.
# Usage: ./scripts/restore.sh <backup-file> [environment]
#
# IMPORTANT: Stop all platform services before running this script.
# The restore replaces the live database; running services will see
# inconsistent state if they hold file handles during the restore.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib.sh"

BACKUP_FILE="${1:-}"
ENV_NAME="${2:-development}"

if [[ -z "$BACKUP_FILE" ]]; then
  echo "Usage: $0 <backup-file> [environment]" >&2
  echo "Available backups in .backups/:" >&2
  ls -lht "$ROOT_DIR/.backups/"*.sqlite 2>/dev/null || echo "  (none found)" >&2
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

load_env "$ENV_NAME"
require_command sqlite3

DB_PATH="${VEMS_DB_PATH:-.data/platform.development.sqlite}"
DB_PATH="$(realpath -m "$ROOT_DIR/$DB_PATH" 2>/dev/null || echo "$ROOT_DIR/$DB_PATH")"

# Verify the backup is a valid SQLite file before touching the live DB
if ! sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" | grep -q "^ok$"; then
  echo "ERROR: Backup file failed integrity check: $BACKUP_FILE" >&2
  exit 1
fi

# Safety checkpoint: create a pre-restore backup of the current DB if it exists
if [[ -f "$DB_PATH" ]]; then
  PRE_RESTORE_BACKUP="${DB_PATH%.sqlite}-pre-restore-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
  echo "Creating pre-restore safety backup: $PRE_RESTORE_BACKUP"
  sqlite3 "$DB_PATH" ".backup '$PRE_RESTORE_BACKUP'"
fi

echo "Restoring $BACKUP_FILE -> $DB_PATH"
mkdir -p "$(dirname "$DB_PATH")"
sqlite3 "$BACKUP_FILE" ".backup '$DB_PATH'"

# Verify restored DB integrity
if ! sqlite3 "$DB_PATH" "PRAGMA integrity_check;" | grep -q "^ok$"; then
  echo "ERROR: Restored database failed integrity check. Original preserved at: $PRE_RESTORE_BACKUP" >&2
  exit 1
fi

echo "Restore complete and integrity verified."
echo "Restored to: $DB_PATH"
