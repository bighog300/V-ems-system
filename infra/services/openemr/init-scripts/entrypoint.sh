#!/usr/bin/env bash
set -euo pipefail

/opt/vems/init-scripts/init-openemr.sh
export MYSQL_PASS="${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}"
export OE_USER="${OPENEMR_ADMIN_USER:?OPENEMR_ADMIN_USER is required}"
export OE_PASS="${OPENEMR_ADMIN_PASSWORD:?OPENEMR_ADMIN_PASSWORD is required}"
exec ./openemr.sh
