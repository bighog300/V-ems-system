#!/bin/sh
set -e

DB_HOST="${DB_HOST:-mysql}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-vtiger}"
DB_PASSWORD="${DB_PASSWORD:-vtigerpass}"
DB_NAME="${DB_NAME:-vtiger}"
DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:?DB_ROOT_PASSWORD is required}"

MAX_ATTEMPTS=30
ATTEMPT=1

echo "⏳ Waiting for MySQL at ${DB_HOST}:${DB_PORT}..."
until mysqladmin ping -h"${DB_HOST}" -P"${DB_PORT}" -uroot -p"${DB_ROOT_PASSWORD}" --silent; do
  if [ "$ATTEMPT" -ge "$MAX_ATTEMPTS" ]; then
    echo "❌ MySQL did not become ready after ${MAX_ATTEMPTS} attempts"
    exit 1
  fi
  echo "⌛ MySQL not ready yet (attempt ${ATTEMPT}/${MAX_ATTEMPTS})"
  ATTEMPT=$((ATTEMPT + 1))
  sleep 2
done

echo "✅ MySQL ready"

echo "🗄️ Ensuring database ${DB_NAME} exists..."
mysql -h"${DB_HOST}" -P"${DB_PORT}" -uroot -p"${DB_ROOT_PASSWORD}" -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME};"

echo "🔍 Checking existing tables in ${DB_NAME}..."
TABLE_COUNT="$(mysql -N -s -h"${DB_HOST}" -P"${DB_PORT}" -uroot -p"${DB_ROOT_PASSWORD}" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}';")"

if [ "${TABLE_COUNT}" = "0" ]; then
  echo "📥 No tables found; applying seed data"
  mysql -h"${DB_HOST}" -P"${DB_PORT}" -u"${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" < /opt/vems/init-scripts/seed-data.sql
  echo "✅ Seed data applied"
else
  echo "✅ Existing schema detected (${TABLE_COUNT} tables); skipping seed"
fi

echo "✅ Vtiger initialization complete"
