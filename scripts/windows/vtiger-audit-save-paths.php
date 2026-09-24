<?php
// Exercise the real UI record model and bulk persistence path, not a browser UI.
if (PHP_SAPI !== 'cli' || getenv('VEMS_AUDIT_PROJECT') !== 'vems-audit-147') exit(1);
ob_start();
chdir('/var/www/html');
require_once 'config.php';
require_once 'vendor/autoload.php';
require_once 'includes/main/WebUI.php';
require_once 'modules/Users/Users.php';
$current_user = Users::getActiveAdminUser();
$adb = PearDatabase::getInstance();
$rows = $adb->pquery("SELECT u.id,u.user_name,u.is_admin FROM vtiger_users u WHERE u.deleted=0 AND u.status='Active'", []);
$users = [];
while ($row = $adb->fetchByAssoc($rows)) $users[] = $row;
$record = $adb->pquery('SELECT vemsvehiclesid FROM vtiger_vemsvehicles WHERE vems_vehicle_id=?', ['AMB-147']);
$id = $adb->query_result($record, 0, 'vemsvehiclesid');
if (!$id) throw new RuntimeException('Synthetic vehicle missing');
$results = [];
foreach ($users as $user) {
    $current_user = new Users();
    $current_user->retrieveCurrentUserInfoFromFile($user['id']);
    foreach (['ui_record_model', 'bulk_saveentity'] as $path) {
        $before = CRMEntity::getInstance('VEMSVehicles');
        $before->retrieve_entity_info($id, 'VEMSVehicles');
        $status = $before->column_fields['vems_operational_status'];
        $outcome = 'WRITE_ACCEPTED';
        try {
            if ($path === 'ui_record_model') {
                $model = Vtiger_Record_Model::getInstanceById($id, 'VEMSVehicles');
                $model->set('mode', 'edit');
                $model->set('vems_operational_status', 'Out of Service');
                $model->save();
            } else {
                $before->id = $id;
                $before->mode = 'edit';
                $before->column_fields['vems_operational_status'] = 'Out of Service';
                $before->saveentity('VEMSVehicles');
            }
        } catch (Throwable $error) {
            $outcome = str_contains($error->getMessage(), 'V-EMS mirrored fields') ? 'MIRROR_WRITE_DENIED' : 'UNEXPECTED_ERROR';
        }
        $after = CRMEntity::getInstance('VEMSVehicles');
        $after->retrieve_entity_info($id, 'VEMSVehicles');
        $results[] = ['identity' => $user['user_name'] === getenv('VTIGER_USERNAME') ? 'integration' : ($user['is_admin'] === 'on' ? 'administrator' : 'other'), 'path' => $path, 'outcome' => $outcome, 'unchanged' => $status === $after->column_fields['vems_operational_status']];
    }
}
ob_end_clean();
echo json_encode(['actual_browser_ui' => 'NOT RUN', 'checks' => $results], JSON_PRETTY_PRINT) . PHP_EOL;
foreach ($results as $result) if ($result['outcome'] !== 'MIRROR_WRITE_DENIED' || !$result['unchanged']) exit(1);
