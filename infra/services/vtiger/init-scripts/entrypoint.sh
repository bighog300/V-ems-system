#!/bin/sh
set -e

cd /var/www/html

# Install composer deps if missing
if [ -f composer.json ] && [ ! -f vendor/autoload.php ]; then
  echo "📦 Installing Composer dependencies..."
  
  if ! command -v composer >/dev/null 2>&1; then
    echo "Installing Composer..."
    apt-get update && apt-get install -y composer
  fi

  composer install --no-interaction --prefer-dist
fi

/opt/vems/init-scripts/init-vtiger.sh
mkdir -p /var/www/html/templates_c/v7
chown -R www-data:www-data /var/www/html
chmod -R 775 /var/www/html/templates_c
if command -v apache2-foreground >/dev/null 2>&1; then
  exec apache2-foreground
elif command -v httpd >/dev/null 2>&1; then
  exec httpd -D FOREGROUND
elif command -v apachectl >/dev/null 2>&1; then
  exec apachectl -D FOREGROUND
else
  echo "❌ No supported web server foreground command found"
  exit 127
fi
