CREATE DATABASE IF NOT EXISTS vtiger CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS openemr CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS vems_orchestration CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'vtiger'@'%' IDENTIFIED BY 'vtigerpass';
CREATE USER IF NOT EXISTS 'openemr'@'%' IDENTIFIED BY 'openemrpass';
CREATE USER IF NOT EXISTS 'vems'@'%' IDENTIFIED BY 'vemspass';

GRANT ALL PRIVILEGES ON vtiger.* TO 'vtiger'@'%';
GRANT ALL PRIVILEGES ON openemr.* TO 'openemr'@'%';
GRANT ALL PRIVILEGES ON vems_orchestration.* TO 'vems'@'%';

FLUSH PRIVILEGES;
