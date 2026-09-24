<?php
/**
 * Audit-only: provisions four read-only manager roles/profiles/accounts requested by
 * the #147 baseline audit (dispatcher, fleet manager, stock manager, supervisor), plus
 * one account per role, so real UI/webservice role checks can run against them.
 *
 * This is deliberately NOT part of provision-development.php or vems-dev. Designing the
 * production role/module/menu permission matrix is #151's scope ("PR 4 - Lists, roles
 * and navigation"); this script only needs enough of a role to prove that (a) a
 * non-admin, non-integration account can sign in and read the mirrored modules, and
 * (b) the persistence guard denies it the same as every other account. Each profile
 * grants view-all/export-all ("viewall") and denies edit-all/create/delete, so nothing
 * here can write a record; mirrored fields stay guarded by VemsMirrorGuardHandler
 * regardless of profile settings, because isPermitted() always answers yes to
 * administrators and per-module edit rights are not being modeled here.
 */
if (PHP_SAPI !== 'cli' || getenv('VEMS_AUDIT_PROJECT') !== 'vems-audit-147') { exit(1); }
ini_set('display_errors', '0');

const VEMS_AUDIT_ROLES = ['Dispatcher', 'FleetManager', 'StockManager', 'Supervisor'];

function vemsAuditRoleEnv(string $role, string $suffix): string {
    $value = getenv('VTIGER_' . strtoupper(preg_replace('/(?<!^)[A-Z]/', '_$0', $role)) . '_' . $suffix);
    if (!is_string($value) || $value === '') throw new RuntimeException("Missing VTIGER_*_$suffix for $role");
    return $value;
}

function vemsProvisionAuditRole(string $role, $adb): array {
    require_once 'modules/Settings/Profiles/models/Record.php';
    require_once 'modules/Settings/Roles/models/Record.php';
    require_once 'modules/Users/Users.php';

    $profileName = 'V-EMS ' . $role . ' (audit)';
    $profile = Settings_Profiles_Record_Model::getInstanceByName($profileName, true);
    if (!$profile) {
        $profile = new Settings_Profiles_Record_Model();
        $profile->set('directly_related_to_role', '1');
        $profile->set('profilename', $profileName);
        $profile->set('description', 'Issue #147 audit role. Read-only; full module scoping is #151 scope.');
        $profile->set('viewall', 'on');
        $profile->set('editall', 'off');
        // save() indexes profile_permissions[tabId]['actions'][actionId] as an array
        // for every action id the running install has (standard and utility). A
        // missing entry crashes create/edit modules and warns everywhere else
        // (Users_Privilege_Model::hasModuleActionPermission reads the same array).
        // Explicitly deny every action id and field on every active tab; "viewall"
        // above is what actually grants read access, independent of this per-tab grid.
        $actionModels = Vtiger_Action_Model::getAll(true);
        $permissions = [];
        foreach (Vtiger_Module_Model::getAll([0], Settings_Profiles_Module_Model::getNonVisibleModulesList()) as $tabId => $module) {
            $actions = [];
            foreach ($actionModels as $actionModel) {
                if ($actionModel->isModuleEnabled($module)) $actions[$actionModel->getId()] = false;
            }
            $permissions[$tabId] = ['is_permitted' => Settings_Profiles_Module_Model::IS_PERMITTED_VALUE, 'actions' => $actions, 'fields' => []];
        }
        $profile->set('profile_permissions', $permissions);
        $profile->save();
    }

    $roleName = 'V-EMS ' . $role . ' (audit)';
    $roleRecord = Settings_Roles_Record_Model::getInstanceByName($roleName);
    if (!$roleRecord) {
        $rootRow = $adb->pquery('SELECT roleid FROM vtiger_role WHERE depth=0', []);
        if (!$adb->num_rows($rootRow)) throw new RuntimeException('Root organization role missing');
        $root = Settings_Roles_Record_Model::getInstanceById($adb->query_result($rootRow, 0, 'roleid'));
        $roleRecord = new Settings_Roles_Record_Model();
        $roleRecord->set('rolename', $roleName);
        $roleRecord->set('allowassignedrecordsto', 1); // vtiger_role.allowassignedrecordsto is NOT NULL
        $roleRecord->set('profileIds', [$profile->getId()]);
        $root->addChildRole($roleRecord);
        // Role::save() never calls setId() on the in-memory model; re-fetch the row it wrote.
        $roleRecord = Settings_Roles_Record_Model::getInstanceByName($roleName);
        if (!$roleRecord) throw new RuntimeException("Role save did not persist for $roleName");
    }

    $username = vemsAuditRoleEnv($role, 'USERNAME');
    $existing = $adb->pquery('SELECT id, accesskey FROM vtiger_users WHERE user_name=?', [$username]);
    if ($adb->num_rows($existing)) {
        return ['role' => $role, 'username' => $username, 'roleid' => $roleRecord->getId(), 'created' => false];
    }
    $user = new Users();
    $user->column_fields['user_name'] = $username;
    $user->column_fields['user_password'] = vemsAuditRoleEnv($role, 'PASSWORD');
    $user->column_fields['confirm_password'] = vemsAuditRoleEnv($role, 'PASSWORD');
    $user->column_fields['last_name'] = 'V-EMS Audit ' . $role;
    $user->column_fields['email1'] = 'audit147-' . strtolower($role) . '@vems.invalid';
    $user->column_fields['is_admin'] = 'off';
    $user->column_fields['status'] = 'Active';
    $user->column_fields['roleid'] = $roleRecord->getId();
    $user->save('Users');
    return ['role' => $role, 'username' => $username, 'roleid' => $roleRecord->getId(), 'created' => true];
}

try {
    chdir('/var/www/html');
    require_once 'config.php';
    require_once 'vendor/autoload.php';
    require_once 'includes/main/WebUI.php';
    require_once 'modules/Users/Users.php';
    $current_user = Users::getActiveAdminUser();
    $adb = PearDatabase::getInstance();
    $accounts = [];
    foreach (VEMS_AUDIT_ROLES as $role) $accounts[] = vemsProvisionAuditRole($role, $adb);
    // isPermitted() reads cached user_privileges files; regenerate them for the new accounts.
    Vtiger_Access::syncSharingAccess();
    echo json_encode(['accounts' => $accounts], JSON_PRETTY_PRINT) . PHP_EOL;
} catch (Throwable $e) {
    $message = $e->getMessage();
    foreach (getenv() as $value) { if (is_string($value) && strlen($value) > 5) { $message = str_replace($value, '[REDACTED]', $message); } }
    fwrite(STDERR, get_class($e) . ': ' . $message . "\n");
    fwrite(STDERR, "Audit role provisioning failed; no credential details emitted (line " . $e->getLine() . ").\n");
    exit(1);
}
