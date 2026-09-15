#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib.sh"

BACKUP_FILE="${1:-}"
ENV_NAME="${2:-development}"
TARGET="${3:-db}"

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "Usage: $0 <backup-file> [environment] [db|object-storage]" >&2
  exit 1
fi

load_env "$ENV_NAME"
validate_required_runtime_secrets

mask_connection_string() {
  echo "$1" | sed -E 's#(://[^:/@]*:)[^@]*(@)#\1***\2#'
}

restore_db() {
  if [[ "${DB_ENGINE:-sqlite}" == "mysql" ]]; then
    require_command mysql
    local db_host="${DB_HOST:-127.0.0.1}"
    local db_port="${DB_PORT:-3306}"
    local db_user="${DB_USER:-root}"
    local db_password="${DB_PASSWORD:-}"
    local db_name="${DB_NAME:-vems}"
    echo "Restoring MySQL backup $BACKUP_FILE -> $db_host:$db_port/$db_name"
    mysql -h"$db_host" -P"$db_port" -u"$db_user" -p"$db_password" "$db_name" < "$BACKUP_FILE"
    mysql -h"$db_host" -P"$db_port" -u"$db_user" -p"$db_password" -e "SELECT 1" "$db_name" >/dev/null
  elif [[ "${VEMS_DB_DRIVER:-sqlite}" == "postgres" ]]; then
    require_command pg_restore
    require_command psql
    local connection_string="${VEMS_POSTGRES_URL:-${DATABASE_URL:-}}"
    if [[ -z "$connection_string" ]]; then
      echo "ERROR: VEMS_POSTGRES_URL/DATABASE_URL is required when VEMS_DB_DRIVER=postgres" >&2
      exit 1
    fi
    echo "Restoring Postgres backup $BACKUP_FILE -> $(mask_connection_string "$connection_string")"
    # --clean --if-exists drops existing objects before recreating them, so
    # this replays cleanly against a database that already has the schema
    # from a prior run (a fresh restore drill, or an actual DR failover).
    pg_restore --clean --if-exists --no-owner --dbname="$connection_string" "$BACKUP_FILE"
    psql "$connection_string" -c "SELECT 1;" >/dev/null
  else
    require_command sqlite3
    local db_path="${VEMS_DB_PATH:-.data/platform.development.sqlite}"
    db_path="$(realpath -m "$ROOT_DIR/$db_path" 2>/dev/null || echo "$ROOT_DIR/$db_path")"

    if ! sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" | grep -q "^ok$"; then
      echo "ERROR: Backup file failed integrity check: $BACKUP_FILE" >&2
      exit 1
    fi

    mkdir -p "$(dirname "$db_path")"
    sqlite3 "$BACKUP_FILE" ".backup '$db_path'"

    if ! sqlite3 "$db_path" "PRAGMA integrity_check;" | grep -q "^ok$"; then
      echo "ERROR: Restored database failed integrity check at $db_path" >&2
      exit 1
    fi
  fi

  echo "Restore complete and validation passed."
}

restore_object_storage() {
  require_command tar
  local object_storage_dir="${VEMS_OBJECT_STORAGE_DIR:-.data/object-storage}"
  object_storage_dir="$(realpath -m "$ROOT_DIR/$object_storage_dir" 2>/dev/null || echo "$ROOT_DIR/$object_storage_dir")"
  local parent_dir
  parent_dir="$(dirname "$object_storage_dir")"
  mkdir -p "$parent_dir"

  if [[ -d "$object_storage_dir" ]]; then
    local safety_copy="${object_storage_dir}.pre-restore-$(date -u +%Y%m%dT%H%M%SZ)"
    echo "Moving existing object storage aside to $safety_copy (not deleted -- remove manually once the restore is verified)"
    mv "$object_storage_dir" "$safety_copy"
  fi

  echo "Restoring object storage backup $BACKUP_FILE -> $object_storage_dir"
  tar -xzf "$BACKUP_FILE" -C "$parent_dir"

  if [[ ! -d "$object_storage_dir/objects" ]]; then
    echo "ERROR: Restored object storage is missing its objects/ directory at $object_storage_dir" >&2
    exit 1
  fi

  local object_count
  object_count="$(find "$object_storage_dir/objects" -name '*.meta.json' | wc -l | tr -d ' ')"
  echo "Restore complete: $object_count object(s) present at $object_storage_dir."
  echo "Note: per-object integrity (decrypt + checksum match) is verified lazily by getObject() at read time, not by this script -- it requires VEMS_OBJECT_STORAGE_KEY, which restore.sh never handles directly."
}

case "$TARGET" in
  db) restore_db ;;
  object-storage) restore_object_storage ;;
  *)
    echo "Unknown restore target: $TARGET (expected db|object-storage)" >&2
    exit 1
    ;;
esac
