#!/bin/bash
set -euo pipefail
export MYSQL_PWD="${DB_PASSWORD:?required}"
exec /opt/vtiger/entrypoint.sh
