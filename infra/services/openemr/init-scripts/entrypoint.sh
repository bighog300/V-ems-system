#!/usr/bin/env bash
set -euo pipefail

/opt/vems/init-scripts/init-openemr.sh
exec /usr/sbin/httpd -D FOREGROUND
