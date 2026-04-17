<?php
$vtiger_version = '8.3.0';

$dbconfig = [
    'db_server' => '${DB_HOST}',
    'db_port' => '${DB_PORT}',
    'db_username' => '${DB_USER}',
    'db_password' => '${DB_PASSWORD}',
    'db_name' => '${DB_NAME}',
    'db_type' => 'mysqli',
    'db_status' => 'true',
];

$site_URL = '${VTIGER_SITE_URL}';
$root_directory = '/var/www/html/';
$cache_dir = 'cache/';

$default_timezone = '${VTIGER_TIMEZONE}';
$default_language = '${VTIGER_LANGUAGE}';
$default_currency_name = '${VTIGER_CURRENCY}';
$default_company_name = '${VTIGER_COMPANY_NAME}';

$admin_email = '${VTIGER_ADMIN_EMAIL}';
$admin_username = '${VTIGER_ADMIN_USER}';
$admin_password = '${VTIGER_ADMIN_PASSWORD}';

$upload_maxsize = 31457280;
$list_max_entries_per_page = '20';
$theme = 'softed';
