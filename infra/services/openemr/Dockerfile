FROM openemr/openemr:latest

COPY init-scripts/ /opt/vems/init-scripts/
COPY config/openemr.conf.php /var/www/localhost/htdocs/openemr/sites/default/sqlconf.php

RUN chmod +x /opt/vems/init-scripts/*.sh
RUN chown apache:apache /var/www/localhost/htdocs/openemr/sites/default/sqlconf.php \
    && chmod 0600 /var/www/localhost/htdocs/openemr/sites/default/sqlconf.php

ENTRYPOINT ["/opt/vems/init-scripts/entrypoint.sh"]
