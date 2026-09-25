<?php
// Audit-only: attempts Vtiger's own webservice delete of ONE record (id in VEMS_GUARD_TARGET) as the Integration user
// and as the administrator, to prove the mirror guard denies deletes for every account. Emits JSON only.
if (PHP_SAPI !== 'cli' || getenv('VEMS_AUDIT_PROJECT') !== 'vems-audit-147') { exit(1); }
ini_set('display_errors', '0');
chdir('/var/www/html');
$target = (string)getenv('VEMS_GUARD_TARGET');
if (!preg_match('/^\d+x\d+$/', $target)) { fwrite(STDERR, "Invalid record id\n"); exit(2); }
ob_start();
require_once 'config.php';
require_once 'vendor/autoload.php';
require_once 'includes/main/WebUI.php';
require_once 'include/Webservices/Utils.php';
require_once 'include/Webservices/Delete.php';
require_once 'modules/Users/Users.php';
global $adb, $current_user;
ob_end_clean();

$result = [];
$accounts = ['integration' => getenv('VTIGER_USERNAME'), 'administrator' => getenv('VTIGER_ADMIN_USER')];
foreach ($accounts as $label => $username) {
    $row = $adb->pquery('SELECT id FROM vtiger_users WHERE user_name=?', [$username]);
    if (!$adb->num_rows($row)) { $result[$label] = ['error' => 'account not found']; continue; }
    $user = new Users();
    $user->retrieveCurrentUserInfoFromFile($adb->query_result($row, 0, 'id'));
    $current_user = $user;
    try {
        vtws_delete($target, $user);
        $result[$label] = ['outcome' => 'DELETED'];
    } catch (Throwable $e) {
        $message = $e->getMessage();
        foreach (getenv() as $value) { if (is_string($value) && strlen($value) > 5) { $message = str_replace($value, '[REDACTED]', $message); } }
        $result[$label] = ['outcome' => 'DENIED', 'code' => method_exists($e, 'getCode') ? (string)$e->getCode() : '', 'message' => $message];
    }
}
$check = $adb->pquery('SELECT deleted FROM vtiger_crmentity WHERE crmid=?', [(int)explode('x', $target)[1]]);
$result['recordStillPresentAndNotDeleted'] = $adb->num_rows($check) === 1 && (string)$adb->query_result($check, 0, 'deleted') === '0';
echo json_encode($result), "\n";
