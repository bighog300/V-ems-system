#!/bin/sh
set -e

/opt/vems/init-scripts/init-vtiger.sh

if command -v apache2-foreground >/dev/null 2>&1; then
  exec apache2-foreground
elif command -v httpd >/dev/null 2>&1; then
  exec httpd -D FOREGROUND
elif command -v apachectl >/dev/null 2>&1; then
  exec apachectl -D FOREGROUND
else
  echo "❌ No supported web server foreground command found"
  echo "Available candidates:"
  command -v apache2-foreground || true
  command -v httpd || true
  command -v apachectl || true
  exit 127
fi
