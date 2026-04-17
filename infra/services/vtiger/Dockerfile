FROM vtigercrm/vtigercrm-8.3.0:latest

COPY init-scripts/ /opt/vems/init-scripts/
COPY config/config.inc.php /var/www/html/config.inc.php

RUN chmod +x /opt/vems/init-scripts/*.sh

ENTRYPOINT ["/opt/vems/init-scripts/entrypoint.sh"]
