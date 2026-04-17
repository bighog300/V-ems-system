#!/usr/bin/env bash
set -euo pipefail

/opt/vems/init-scripts/init-openemr.sh
exec apache2-foreground
