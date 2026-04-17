FROM vtiger/vtigercrm:latest

RUN apt-get update \
    && apt-get install -y --no-install-recommends default-mysql-client curl wget git \
    && rm -rf /var/lib/apt/lists/*

COPY init-scripts/ /opt/vems/init-scripts/
COPY config/config.inc.php /var/www/html/config.inc.php

RUN chmod +x /opt/vems/init-scripts/*.sh \
    && chown -R www-data:www-data /var/www/html

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -fsS http://localhost/ >/dev/null || exit 1

EXPOSE 80

ENTRYPOINT ["/opt/vems/init-scripts/entrypoint.sh"]
