#!/bin/sh
set -e

MYSQL_HOST="${MYSQL_HOST:-mysql}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-openemr}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-openemrpass}"
MYSQL_DATABASE="${MYSQL_DATABASE:-openemr}"
MYSQL_SSL_CA="${MYSQL_SSL_CA:-}"

if [ -n "$MYSQL_SSL_CA" ]; then
  MYSQL_SSL_ARGS="--ssl-ca=${MYSQL_SSL_CA} --ssl-verify-server-cert"
else
  MYSQL_SSL_ARGS=""
fi

MAX_ATTEMPTS=30
ATTEMPT=1

echo "⏳ Waiting for MySQL at ${MYSQL_HOST}:${MYSQL_PORT}..."
until mysqladmin ${MYSQL_SSL_ARGS} ping -h"${MYSQL_HOST}" -P"${MYSQL_PORT}" -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" --silent; do
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
mysql ${MYSQL_SSL_ARGS} -h"${MYSQL_HOST}" -P"${MYSQL_PORT}" -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" -e "CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\`;"
# The MySQL bootstrap script owns database grants; the application user cannot
# grant its own privileges and this initializer must remain repeatable.

TABLE_COUNT="$(mysql ${MYSQL_SSL_ARGS} -N -s -h"${MYSQL_HOST}" -P"${MYSQL_PORT}" -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${MYSQL_DATABASE}';")"
if [ "${TABLE_COUNT}" = "0" ]; then
  echo "📥 No tables found; applying seed data"
  mysql ${MYSQL_SSL_ARGS} -h"${MYSQL_HOST}" -P"${MYSQL_PORT}" -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}" < /opt/vems/init-scripts/seed-data.sql
else
  echo "✅ Existing schema detected (${TABLE_COUNT} tables); skipping seed"
fi

echo "👤 Applying test users template"
mysql ${MYSQL_SSL_ARGS} -h"${MYSQL_HOST}" -P"${MYSQL_PORT}" -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}" < /opt/vems/init-scripts/create-test-users.sql

echo "✅ OpenEMR initialization complete"
