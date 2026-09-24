<?php
// Exercise the real UI record model, event save and bulk/direct persistence paths, not a browser UI.
if (PHP_SAPI !== 'cli' || getenv('VEMS_AUDIT_PROJECT') !== 'vems-audit-147') exit(1);
ob_start();
chdir('/var/www/html');
require_once 'config.php';
require_once 'vendor/autoload.php';
require_once 'includes/main/WebUI.php';
require_once 'modules/Users/Users.php';
require_once '/opt/vems/install-mirror-guard.php';
$current_user = Users::getActiveAdminUser();
$adb = PearDatabase::getInstance();
$rows = $adb->pquery("SELECT u.id,u.user_name,u.is_admin FROM vtiger_users u WHERE u.deleted=0 AND u.status='Active'", []);
$users = [];
while ($row = $adb->fetchByAssoc($rows)) $users[] = $row;
$vehicle = function (string $canonical) use ($adb) {
    $record = $adb->pquery('SELECT vemsvehiclesid FROM vtiger_vemsvehicles WHERE vems_vehicle_id=?', [$canonical]);
    $id = $adb->query_result($record, 0, 'vemsvehiclesid');
    if (!$id) throw new RuntimeException('Synthetic vehicle missing');
    return $id;
};
$status = function ($id) {
    $entity = CRMEntity::getInstance('VEMSVehicles');
    $entity->retrieve_entity_info($id, 'VEMSVehicles');
    return $entity->column_fields['vems_operational_status'];
};
$identity = fn($user) => $user['user_name'] === getenv('VTIGER_USERNAME') ? 'integration' : ($user['is_admin'] === 'on' ? 'administrator' : 'other');
$handlers = [];
$registered = $adb->pquery('SELECT event_name,handler_path,is_active FROM vtiger_eventhandlers WHERE handler_class=? ORDER BY event_name', ['VemsMirrorGuardHandler']);
while ($row = $adb->fetchByAssoc($registered)) $handlers[] = ['event' => $row['event_name'], 'path' => $row['handler_path'], 'active' => $row['is_active'] === '1'];
$core = file_get_contents('data/CRMEntity.php');
$installation = [
    'core_crmentity_pinned' => hash('sha256', $core) === VEMS_PINNED_CRMENTITY_SHA256,
    'core_contains_guard' => str_contains($core, 'VemsMirrorGuard'),
    'handlers' => $handlers,
];

// Event-raising paths must be denied for every account and leave the record unchanged.
$id = $vehicle('AMB-147');
$results = [];
foreach ($users as $user) {
    $current_user = new Users();
    $current_user->retrieveCurrentUserInfoFromFile($user['id']);
    foreach (['ui_record_model', 'crmentity_save'] as $path) {
        $before = $status($id);
        $outcome = 'WRITE_ACCEPTED';
        try {
            if ($path === 'ui_record_model') {
                $model = Vtiger_Record_Model::getInstanceById($id, 'VEMSVehicles');
                $model->set('mode', 'edit');
                $model->set('vems_operational_status', 'Out of Service');
                $model->save();
            } else {
                $focus = CRMEntity::getInstance('VEMSVehicles');
                $focus->retrieve_entity_info($id, 'VEMSVehicles');
                $focus->id = $id;
                $focus->mode = 'edit';
                $focus->column_fields['vems_operational_status'] = 'Out of Service';
                $focus->save('VEMSVehicles');
            }
        } catch (Throwable $error) {
            $outcome = str_contains($error->getMessage(), 'V-EMS mirrored fields') ? 'MIRROR_WRITE_DENIED' : 'UNEXPECTED_ERROR';
        }
        $results[] = ['identity' => $identity($user), 'path' => $path, 'outcome' => $outcome, 'unchanged' => $before === $status($id)];
    }
    // Import runs in bulk-save mode without the handler; the installer removes it from profiles.
    $results[] = ['identity' => $identity($user), 'path' => 'ui_import_permission', 'outcome' => isPermitted('VEMSVehicles', 'Import') === 'yes' ? 'IMPORT_PERMITTED' : 'IMPORT_DENIED'];
}

// Known bypasses without save events. Run once as administrator on a dedicated synthetic
// vehicle; the caller repairs it through the canonical worker immediately afterwards.
$bypassId = $vehicle(getenv('VEMS_BYPASS_VEHICLE'));
$current_user = Users::getActiveAdminUser();
$bypasses = [];
foreach (['bulk_save_mode' => 'Bypass bulk 148', 'direct_saveentity' => 'Bypass direct 148'] as $path => $value) {
    $focus = CRMEntity::getInstance('VEMSVehicles');
    $focus->retrieve_entity_info($bypassId, 'VEMSVehicles');
    $focus->id = $bypassId;
    $focus->mode = 'edit';
    $focus->column_fields['vems_operational_status'] = $value;
    $outcome = 'NOT_BYPASSED';
    try {
        if ($path === 'bulk_save_mode') {
            $VTIGER_BULK_SAVE_MODE = true;
            try { $focus->save('VEMSVehicles'); } finally { $VTIGER_BULK_SAVE_MODE = false; }
        } else {
            $focus->saveentity('VEMSVehicles');
        }
        if ($status($bypassId) === $value) $outcome = 'BYPASS_CONFIRMED';
    } catch (Throwable $error) {
        $outcome = str_contains($error->getMessage(), 'V-EMS mirrored fields') ? 'MIRROR_WRITE_DENIED' : 'UNEXPECTED_ERROR';
    }
    $bypasses[] = ['identity' => 'administrator', 'path' => $path, 'outcome' => $outcome];
}
ob_end_clean();
echo json_encode(['actual_browser_ui' => 'NOT RUN', 'installation' => $installation, 'checks' => $results, 'bypasses' => $bypasses], JSON_PRETTY_PRINT) . PHP_EOL;
if (!$installation['core_crmentity_pinned'] || $installation['core_contains_guard'] || count(array_filter($handlers, fn($handler) => $handler['active'])) !== 2) exit(1);
foreach ($results as $result) {
    if ($result['path'] === 'ui_import_permission') {
        if ($result['identity'] === 'integration' && $result['outcome'] !== 'IMPORT_DENIED') exit(1);
    } elseif ($result['outcome'] !== 'MIRROR_WRITE_DENIED' || !$result['unchanged']) exit(1);
}
