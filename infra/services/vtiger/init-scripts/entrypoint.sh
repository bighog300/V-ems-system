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

chown -R www-data:www-data \
  /var/www/html/cache \
  /var/www/html/storage \
  /var/www/html/user_privileges \
  /var/www/html/logs \
  /var/www/html/modules \
  /var/www/html/cron \
  /var/www/html/test

chown www-data:www-data \
  /var/www/html/config.inc.php \
  /var/www/html/tabdata.php \
  /var/www/html/parent_tabdata.php

chmod 664 \
  /var/www/html/config.inc.php \
  /var/www/html/tabdata.php \
  /var/www/html/parent_tabdata.php

chmod -R 775 \
  /var/www/html/cache \
  /var/www/html/storage \
  /var/www/html/user_privileges \
  /var/www/html/logs \
  /var/www/html/modules \
  /var/www/html/cron \
  /var/www/html/test

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
