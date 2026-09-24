<?php
// Read-only inventory; run via stdin in the isolated audit container only.
if (PHP_SAPI !== 'cli' || getenv('VEMS_AUDIT_PROJECT') !== 'vems-audit-147') { exit(1); }
ob_start();
chdir('/var/www/html');
require_once 'config.php';
require_once 'vendor/autoload.php';
require_once 'includes/main/WebUI.php';
require_once 'modules/Users/Users.php';
$current_user = Users::getActiveAdminUser();
$adb = PearDatabase::getInstance();
$result = $adb->pquery('SELECT roleid,rolename FROM vtiger_role ORDER BY roleid', []);
$roles = [];
while ($row = $adb->fetchByAssoc($result)) { $roles[] = $row; }
$result = $adb->pquery('SELECT u.user_name,u.is_admin,u.status,r.roleid FROM vtiger_users u LEFT JOIN vtiger_user2role r ON r.userid=u.id WHERE u.deleted=0', []);
$users = [];
while ($row = $adb->fetchByAssoc($result)) {
    $users[] = ['identity' => $row['user_name'] === getenv('VTIGER_USERNAME') ? 'integration' : ($row['user_name'] === getenv('VTIGER_ADMIN_USER') ? 'administrator' : 'other'), 'is_admin' => $row['is_admin'], 'status' => $row['status'], 'roleid' => $row['roleid']];
}
ob_end_clean();
echo json_encode(['roles'=>$roles,'users'=>$users], JSON_PRETTY_PRINT) . PHP_EOL;
