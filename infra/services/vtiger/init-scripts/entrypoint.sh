#!/usr/bin/env bash
set -euo pipefail

/opt/vems/init-scripts/init-vtiger.sh
exec apache2-foreground
