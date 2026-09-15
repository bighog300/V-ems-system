#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib.sh"

ENV_NAME="${1:-development}"
TARGET="${2:-db}"
load_env "$ENV_NAME"
validate_required_runtime_secrets

BACKUP_DIR="${VEMS_BACKUP_DIR:-$ROOT_DIR/.backups}"
mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

# Masks the password in a postgresql:// connection string before it's ever
# echoed to a log -- the same string that VEMS_POSTGRES_URL/DATABASE_URL
# carries, which milestone 12f's production-secrets checks otherwise treat
# as a secret to be refused-if-insecure, never a value to print.
mask_connection_string() {
  echo "$1" | sed -E 's#(://[^:/@]*:)[^@]*(@)#\1***\2#'
}

backup_db() {
  if [[ "${DB_ENGINE:-sqlite}" == "mysql" ]]; then
    require_command mysqldump
    local db_host="${DB_HOST:-127.0.0.1}"
    local db_port="${DB_PORT:-3306}"
    local db_user="${DB_USER:-root}"
    local db_password="${DB_PASSWORD:-}"
    local db_name="${DB_NAME:-vems}"
    local backup_file="$BACKUP_DIR/mysql-${ENV_NAME}-${TIMESTAMP}.sql"
    echo "Backing up MySQL $db_host:$db_port/$db_name -> $backup_file"
    mysqldump -h"$db_host" -P"$db_port" -u"$db_user" -p"$db_password" --single-transaction --routines --triggers "$db_name" > "$backup_file"
    echo "Backup complete: $backup_file"
  elif [[ "${VEMS_DB_DRIVER:-sqlite}" == "postgres" ]]; then
    require_command pg_dump
    local connection_string="${VEMS_POSTGRES_URL:-${DATABASE_URL:-}}"
    if [[ -z "$connection_string" ]]; then
      echo "ERROR: VEMS_POSTGRES_URL/DATABASE_URL is required when VEMS_DB_DRIVER=postgres" >&2
      exit 1
    fi
    local backup_file="$BACKUP_DIR/platform-postgres-${ENV_NAME}-${TIMESTAMP}.dump"
    echo "Backing up Postgres ($(mask_connection_string "$connection_string")) -> $backup_file"
    # Custom format (-Fc): compressed, and the only format pg_restore --clean
    # --if-exists can replay against a live database in restore.sh.
    pg_dump --format=custom --file="$backup_file" "$connection_string"
    echo "Backup complete: $backup_file"
  else
    require_command sqlite3
    local db_path="${VEMS_DB_PATH:-.data/platform.development.sqlite}"
    db_path="$(realpath -m "$ROOT_DIR/$db_path" 2>/dev/null || echo "$ROOT_DIR/$db_path")"
    local backup_file="$BACKUP_DIR/platform-${ENV_NAME}-${TIMESTAMP}.sqlite"

    if [[ ! -f "$db_path" ]]; then
      echo "ERROR: Database not found at $db_path" >&2
      exit 1
    fi

    echo "Backing up $db_path -> $backup_file"
    sqlite3 "$db_path" ".backup '$backup_file'"
    echo "Backup complete: $backup_file"
  fi
}

backup_object_storage() {
  require_command tar
  local object_storage_dir="${VEMS_OBJECT_STORAGE_DIR:-.data/object-storage}"
  object_storage_dir="$(realpath -m "$ROOT_DIR/$object_storage_dir" 2>/dev/null || echo "$ROOT_DIR/$object_storage_dir")"

  if [[ ! -d "$object_storage_dir" ]]; then
    echo "ERROR: Object storage directory not found at $object_storage_dir" >&2
    exit 1
  fi

  local backup_file="$BACKUP_DIR/object-storage-${ENV_NAME}-${TIMESTAMP}.tar.gz"
  echo "Backing up object storage $object_storage_dir -> $backup_file"
  # Objects on disk are already encrypted at rest (VEMS_OBJECT_STORAGE_KEY) --
  # this is a plain archive of already-encrypted bytes, not a second
  # encryption layer. The encryption key itself is a secret and is never
  # backed up alongside the data it protects; see the DR runbook.
  tar -czf "$backup_file" -C "$(dirname "$object_storage_dir")" "$(basename "$object_storage_dir")"
  echo "Backup complete: $backup_file"
}

case "$TARGET" in
  db) backup_db ;;
  object-storage) backup_object_storage ;;
  all)
    backup_db
    backup_object_storage
    ;;
  *)
    echo "Unknown backup target: $TARGET (expected db|object-storage|all)" >&2
    exit 1
    ;;
esac
