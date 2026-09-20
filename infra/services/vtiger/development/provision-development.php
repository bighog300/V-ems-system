<?php
if (getenv('VEMS_DEVELOPMENT') !== 'true' || PHP_SAPI !== 'cli') { exit(1); }
ini_set('display_errors', '0');
try {
    chdir('/var/www/html');
    require_once 'config.php';
    require_once 'vendor/autoload.php';
    require_once 'include/Webservices/Relation.php';
    require_once 'vtlib/Vtiger/Module.php';
    require_once 'includes/main/WebUI.php';
    require_once 'include/Webservices/Utils.php';
    require_once 'modules/Users/Users.php';
    $current_user = Users::getActiveAdminUser();
    $adb = PearDatabase::getInstance();
    // Apply the development administrator password once using Vtiger's own hasher.
    $marker = '/var/www/html/storage/.vems-dev-admin-initialized';
    if (!file_exists($marker)) {
        if (!$current_user->change_password('', getenv('VTIGER_ADMIN_PASSWORD'), false)) { throw new RuntimeException('Admin initialization failed'); }
        file_put_contents($marker, 'initialized');
    }
    $username = getenv('VTIGER_USERNAME');
    $result = $adb->pquery('SELECT id, accesskey FROM vtiger_users WHERE user_name=?', [$username]);
    if (!$adb->num_rows($result)) {
        $user = new Users();
        $user->column_fields['user_name'] = $username;
        $user->column_fields['user_password'] = getenv('VTIGER_PASSWORD');
        $user->column_fields['confirm_password'] = getenv('VTIGER_PASSWORD');
        $user->column_fields['last_name'] = 'VEMS Development Integration';
        $user->column_fields['email1'] = 'development@vems.invalid';
        $user->column_fields['is_admin'] = 'off';
        $user->column_fields['status'] = 'Active';
        $user->column_fields['roleid'] = 'H2';
        $user->save('Users');
        // Vtiger creates the key on save; stamp the cryptographically generated local key once.
        $adb->pquery('UPDATE vtiger_users SET accesskey=? WHERE id=?', [getenv('VTIGER_ACCESS_KEY'), $user->id]);
    } elseif (!hash_equals(getenv('VTIGER_ACCESS_KEY'), $adb->query_result($result, 0, 'accesskey'))) {
        throw new RuntimeException('Existing integration credentials mismatch');
    }
    $schemas = json_decode(file_get_contents('/opt/vems/modules.json'), true, 512, JSON_THROW_ON_ERROR);
    foreach ($schemas as $name => $fields) {
        $module = Vtiger_Module::getInstance($name);
        if (!$module) {
            $module = new Vtiger_Module(); $module->name = $name; $module->parent = 'Support'; $module->save(); $module->initTables();
            $module->initWebservice();
        }
        $blocks = Vtiger_Block::getAllForModule($module);
        $block = $blocks ? reset($blocks) : null;
        if (!$block) { $block = new Vtiger_Block(); $block->label = 'LBL_VEMS_INFORMATION'; $module->addBlock($block); }
        foreach ($fields as $name) {
            if (Vtiger_Field::getInstance($name, $module)) { continue; }
            $field = new Vtiger_Field(); $field->name = $name; $field->label = $name;
            $field->table = $module->basetable; $field->column = $name;
            $field->columntype = 'VARCHAR(255)'; $field->uitype = 1; $field->typeofdata = 'V~O';
            if ($name === 'assigned_user_id') { $field->table = 'vtiger_crmentity'; $field->column = 'smownerid'; $field->uitype = 53; $field->columntype = 'INT(19)'; }
            $block->addField($field);
        }
    }
    echo "Vtiger development identity and adapter fields ready; credentials preserved.\n";
} catch (Throwable $e) {
    $message = $e->getMessage();
    foreach (getenv() as $value) { if (is_string($value) && strlen($value) > 5) { $message = str_replace($value, '[REDACTED]', $message); } }
    fwrite(STDERR, get_class($e) . ': ' . $message . "\n");
    fwrite(STDERR, "Vtiger development provisioning failed; no credential details emitted (line " . $e->getLine() . ").\n");
    exit(1);
}
