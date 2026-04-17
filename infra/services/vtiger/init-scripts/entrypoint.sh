#!/usr/bin/env bash
set -euo pipefail

cd /var/www/html

if [ -f composer.json ] && [ ! -f vendor/autoload.php ]; then
  echo "Installing Composer dependencies..."
  composer install --no-interaction --prefer-dist
fi

mkdir -p \
  cache cache/images cache/import storage user_privileges logs \
  cron/modules test/vtlib/HTML test/wordtemplatedownload \
  test/product test/user test/contact test/logo

touch config.inc.php tabdata.php parent_tabdata.php

chown -R www-data:www-data /var/www/html
find /var/www/html -type d -exec chmod 775 {} \;
find /var/www/html -type f -exec chmod 664 {} \;

/opt/vems/init-scripts/init-vtiger.sh

if command -v apache2-foreground >/dev/null 2>&1; then
  exec apache2-foreground
elif command -v httpd >/dev/null 2>&1; then
  exec httpd -D FOREGROUND
elif command -v apachectl >/dev/null 2>&1; then
  exec apachectl -D FOREGROUND
else
  echo "No supported web server foreground command found"
  exit 127
fi
