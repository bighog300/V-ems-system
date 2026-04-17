FROM openemr/openemr:latest

COPY init-scripts/ /opt/vems/init-scripts/
COPY config/openemr.conf.php /var/www/localhost/htdocs/openemr/sites/default/sqlconf.php

RUN chmod +x /opt/vems/init-scripts/*.sh

ENTRYPOINT ["/opt/vems/init-scripts/entrypoint.sh"]
