FROM vtigercrm/vtigercrm-8.3.0:latest

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      default-mysql-client \
      curl \
      wget \
      git \
      composer \
      rsync \
      gettext-base \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/vtiger-dist /opt/vems/init-scripts /opt/vems/templates \
    && rsync -a /var/www/html/ /opt/vtiger-dist/

COPY init-scripts/ /opt/vems/init-scripts/
COPY config/config.inc.php.tpl /opt/vems/templates/config.inc.php.tpl

RUN chmod +x /opt/vems/init-scripts/*.sh

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -fsS http://localhost/ >/dev/null || exit 1

EXPOSE 80

ENTRYPOINT ["/opt/vems/init-scripts/entrypoint.sh"]
