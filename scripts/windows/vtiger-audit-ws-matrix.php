<?php
// Per-account webservice matrix; run via stdin in the isolated audit container only.
// Access keys are read from the audit database and used in-process; they are never emitted.
if (PHP_SAPI !== 'cli' || getenv('VEMS_AUDIT_PROJECT') !== 'vems-audit-147') { exit(1); }
ob_start();
chdir('/var/www/html');
require_once 'config.php';
require_once 'vendor/autoload.php';
require_once 'includes/main/WebUI.php';
$adb = PearDatabase::getInstance();
$modules = ['HelpDesk','VEMSAssignments','VEMSVehicles','VEMSPersonnel','VEMSAssignmentCrew','VEMSStockItems','VEMSVehicleStock','VEMSStockUsage'];
function ws($params, $post = false) {
    $url = 'http://127.0.0.1/webservice.php';
    $ctx = ['http' => ['method' => $post ? 'POST' : 'GET', 'ignore_errors' => true, 'timeout' => 20]];
    if ($post) { $ctx['http']['header'] = 'Content-Type: application/x-www-form-urlencoded'; $ctx['http']['content'] = http_build_query($params); }
    else { $url .= '?' . http_build_query($params); }
    $raw = @file_get_contents($url, false, stream_context_create($ctx));
    $d = json_decode($raw === false ? '' : preg_replace('/^.*?(\{.*)$/s', '$1', $raw), true);
    return is_array($d) ? $d : ['success' => false, 'error' => ['code' => 'BAD_RESPONSE']];
}
$rows = [];
$q = $adb->pquery('SELECT u.user_name,u.accesskey,u.is_admin,r.rolename FROM vtiger_users u LEFT JOIN vtiger_user2role ur ON ur.userid=u.id LEFT JOIN vtiger_role r ON r.roleid=ur.roleid WHERE u.deleted=0 AND u.status=?', ['Active']);
while ($r = $adb->fetchByAssoc($q)) { $rows[] = $r; }
$out = [];
foreach ($rows as $u) {
    $name = $u['user_name'];
    $identity = $name === getenv('VTIGER_USERNAME') ? 'integration' : ($name === getenv('VTIGER_ADMIN_USER') ? 'administrator' : strtolower(preg_replace('/[^A-Za-z]/', '', preg_replace('/^V-EMS |\(audit\)/', '', (string)$u['rolename']))));
    $entry = ['identity' => $identity, 'role' => $u['rolename'], 'login' => 'FAIL', 'reads' => [], 'writes' => []];
    $c = ws(['operation' => 'getchallenge', 'username' => $name]);
    if (empty($c['success'])) { $out[] = $entry; continue; }
    $l = ws(['operation' => 'login', 'username' => $name, 'accessKey' => md5($c['result']['token'] . $u['accesskey'])], true);
    if (empty($l['success'])) { $out[] = $entry; continue; }
    $entry['login'] = 'PASS';
    $sn = $l['result']['sessionName'];
    foreach ($modules as $m) {
        $d = ws(['operation' => 'describe', 'sessionName' => $sn, 'elementType' => $m]);
        $qr = ws(['operation' => 'query', 'sessionName' => $sn, 'query' => "SELECT * FROM $m LIMIT 1;"]);
        $entry['reads'][$m] = [
            'describe' => !empty($d['success']) ? 'ALLOWED' : 'DENIED:' . ($d['error']['code'] ?? '?'),
            'query' => !empty($qr['success']) ? 'ALLOWED(rows=' . count($qr['result']) . ')' : 'DENIED:' . ($qr['error']['code'] ?? '?'),
            'updateable' => $d['result']['updateable'] ?? null,
            'createable' => $d['result']['createable'] ?? null,
        ];
        if (!empty($qr['success']) && count($qr['result'])) {
            $rec = $qr['result'][0];
            $entry['_first'][$m] = $rec['id'];
        }
    }
    // Attempt: mirrored operational-status change on the synthetic vehicle.
    $v = ws(['operation' => 'query', 'sessionName' => $sn, 'query' => "SELECT * FROM VEMSVehicles WHERE vems_vehicle_id='AMB-147';"]);
    if (!empty($v['success']) && count($v['result'])) {
        $rec = $v['result'][0];
        $before = $rec['vems_operational_status'];
        $rec['vems_operational_status'] = 'Out of Service';
        $u2 = ws(['operation' => 'update', 'sessionName' => $sn, 'element' => json_encode($rec)], true);
        $r2 = ws(['operation' => 'retrieve', 'sessionName' => $sn, 'id' => $rec['id']]);
        $entry['writes']['vehicle_status_update'] = [
            'result' => !empty($u2['success']) ? 'ACCEPTED' : 'DENIED:' . ($u2['error']['code'] ?? '?') . ':' . substr((string)($u2['error']['message'] ?? ''), 0, 80),
            'mirrorBefore' => $before,
            'mirrorAfter' => $r2['result']['vems_operational_status'] ?? null,
        ];
        if (!empty($u2['success']) && ($r2['result']['vems_operational_status'] ?? '') !== $before) { $entry['writes']['vehicle_status_update']['restoredNeeded'] = true; }
    } else {
        $entry['writes']['vehicle_status_update'] = ['result' => 'NO_READ_ACCESS_TO_TARGET'];
    }
    unset($entry['_first']);
    $out[] = $entry;
}
ob_end_clean();
echo json_encode($out, JSON_PRETTY_PRINT) . PHP_EOL;
