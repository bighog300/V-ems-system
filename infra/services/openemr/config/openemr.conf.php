<?php

declare(strict_types=1);

// The upstream container uses this marker to decide whether auto_configure.php
// must run. The installer changes it to 1 after a successful installation.
$config = 0;

// OpenEMR loads this file for every site request. Credentials stay in the
// container environment; this repository file contains no credential values.
$required = static function (string $name): string {
    $value = getenv($name);
    if ($value === false || $value === '') {
        throw new RuntimeException(sprintf('%s is required for OpenEMR SQL configuration', $name));
    }
    return $value;
};

$sqlconf = [
    'dbase' => getenv('MYSQL_DATABASE') ?: 'openemr',
    'login' => $required('MYSQL_USER'),
    'pass' => $required('MYSQL_PASSWORD'),
    'host' => getenv('MYSQL_HOST') ?: 'mysql',
    'port' => (int) (getenv('MYSQL_PORT') ?: '3306'),
];
