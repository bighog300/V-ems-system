FROM openemr/openemr:latest

RUN apt-get update \
    && apt-get install -y --no-install-recommends default-mysql-client curl wget \
    && rm -rf /var/lib/apt/lists/*

COPY init-scripts/ /opt/vems/init-scripts/
COPY config/openemr.conf.php /var/www/localhost/htdocs/openemr/sites/default/sqlconf.php

RUN chmod +x /opt/vems/init-scripts/*.sh

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -fsS http://localhost/ >/dev/null || exit 1

EXPOSE 80 443

ENTRYPOINT ["apache2-foreground"]
