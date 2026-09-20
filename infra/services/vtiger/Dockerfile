FROM ghcr.io/bighog300/vtigercrm:8.3.0@sha256:cddc2be88eec6d766fb0462ad250aba68a2ceb49df946a6c26d855ad11327a69
COPY development/ /opt/vems/
# Keep the established distribution and schema; avoid passwords in mysql argv.
RUN sed -i 's/-p"${DB_PASSWORD}"//g' /opt/vtiger/entrypoint.sh
ENTRYPOINT ["/bin/bash", "/opt/vems/entrypoint.sh"]
