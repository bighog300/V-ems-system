#!/usr/bin/env bash
set -e

MYSQL_HOST="${MYSQL_HOST:-mysql}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-openemr}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-openemrpass}"
MYSQL_DATABASE="${MYSQL_DATABASE:-openemr}"

MAX_ATTEMPTS=30
ATTEMPT=1

echo "⏳ Waiting for MySQL at ${MYSQL_HOST}:${MYSQL_PORT}..."
until mysqladmin ping -h"${MYSQL_HOST}" -P"${MYSQL_PORT}" -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" --silent; do
  if [ "$ATTEMPT" -ge "$MAX_ATTEMPTS" ]; then
    echo "❌ MySQL did not become ready after ${MAX_ATTEMPTS} attempts"
    exit 1
  fi
  echo "⌛ MySQL not ready yet (attempt ${ATTEMPT}/${MAX_ATTEMPTS})"
  ATTEMPT=$((ATTEMPT + 1))
  sleep 2
done

echo "✅ MySQL ready"

echo "🗄️ Creating database/user grants for ${MYSQL_DATABASE}..."
mysql -h"${MYSQL_HOST}" -P"${MYSQL_PORT}" -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" -e "CREATE DATABASE IF NOT EXISTS \\`${MYSQL_DATABASE}\\`;"
mysql -h"${MYSQL_HOST}" -P"${MYSQL_PORT}" -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" -e "GRANT ALL PRIVILEGES ON \\`${MYSQL_DATABASE}\\`.* TO '${MYSQL_USER}'@'%'; FLUSH PRIVILEGES;"

TABLE_COUNT="$(mysql -N -s -h"${MYSQL_HOST}" -P"${MYSQL_PORT}" -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${MYSQL_DATABASE}';")"
if [ "${TABLE_COUNT}" = "0" ]; then
  echo "📥 No tables found; applying seed data"
  mysql -h"${MYSQL_HOST}" -P"${MYSQL_PORT}" -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}" < /opt/vems/init-scripts/seed-data.sql
else
  echo "✅ Existing schema detected (${TABLE_COUNT} tables); skipping seed"
fi

echo "👤 Applying test users template"
mysql -h"${MYSQL_HOST}" -P"${MYSQL_PORT}" -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}" < /opt/vems/init-scripts/create-test-users.sql

echo "✅ OpenEMR initialization complete"
