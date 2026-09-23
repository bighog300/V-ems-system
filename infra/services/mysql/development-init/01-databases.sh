#!/bin/bash
set -euo pipefail
# Works when sourced or executed by the official entrypoint, including Windows bind mounts.
[[ "$VTIGER_DB_PASSWORD" =~ ^[A-Za-z0-9_-]+$ ]] || exit 1
[[ "$OPENEMR_DB_PASSWORD" =~ ^[A-Za-z0-9_-]+$ ]] || exit 1
MYSQL_PWD="${MYSQL_ROOT_PASSWORD:?required}" mysql --protocol=socket -uroot <<SQL
CREATE DATABASE IF NOT EXISTS vtiger CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS openemr CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'vtiger'@'%' IDENTIFIED BY '${VTIGER_DB_PASSWORD}';
CREATE USER IF NOT EXISTS 'openemr'@'%' IDENTIFIED BY '${OPENEMR_DB_PASSWORD}';
GRANT ALL ON vtiger.* TO 'vtiger'@'%';
GRANT ALL ON openemr.* TO 'openemr'@'%';
SQL
