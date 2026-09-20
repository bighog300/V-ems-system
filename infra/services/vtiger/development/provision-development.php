<?php
if (getenv('VEMS_DEVELOPMENT') !== 'true' || PHP_SAPI !== 'cli') { exit(1); }
ini_set('display_errors', '0');

// vtlib registers a module in the database but does not create the CRMEntity class that
// Vtiger's webservice layer loads (CRMEntity::getInstance); without it every describe/query
// answers "Attempt to access restricted file". Creating the files is idempotent.
function vemsEnsureModuleFiles(string $module, string $identifier): void
{
    $lower = strtolower($module);
    $directory = "modules/$module";
    if (!is_dir($directory) && !mkdir($directory, 0755, true)) { throw new RuntimeException("Cannot create module directory for $module"); }
    if (!file_exists("$directory/$module.php")) {
        $template = <<<'PHP'
<?php
class %%MODULE%% extends CRMEntity {
	var $db, $log;
	var $table_name = 'vtiger_%%LOWER%%';
	var $table_index = '%%LOWER%%id';
	var $column_fields = array();
	var $IsCustomModule = true;
	var $customFieldTable = array('vtiger_%%LOWER%%cf', '%%LOWER%%id');
	var $tab_name = array('vtiger_crmentity', 'vtiger_%%LOWER%%', 'vtiger_%%LOWER%%cf');
	var $tab_name_index = array('vtiger_crmentity' => 'crmid', 'vtiger_%%LOWER%%' => '%%LOWER%%id', 'vtiger_%%LOWER%%cf' => '%%LOWER%%id');
	var $list_fields = array('External Key' => array('%%LOWER%%', '%%IDENT%%'), 'Assigned To' => array('crmentity', 'smownerid'));
	var $list_fields_name = array('External Key' => '%%IDENT%%', 'Assigned To' => 'assigned_user_id');
	var $list_link_field = '%%IDENT%%';
	var $search_fields = array('External Key' => array('%%LOWER%%', '%%IDENT%%'), 'Assigned To' => array('vtiger_crmentity', 'assigned_user_id'));
	var $search_fields_name = array('External Key' => '%%IDENT%%', 'Assigned To' => 'assigned_user_id');
	var $popup_fields = array('%%IDENT%%');
	var $sortby_fields = array();
	var $def_basicsearch_col = '%%IDENT%%';
	var $def_detailview_recname = '%%IDENT%%';
	var $required_fields = array('assigned_user_id' => 1);
	var $mandatory_fields = array('assigned_user_id');
	var $default_order_by = '%%IDENT%%';
	var $default_sort_order = 'ASC';

	function __construct() {
		global $log;
		$this->column_fields = getColumnFields(get_class($this));
		$this->db = new PearDatabase();
		$this->log = $log;
	}

	function save_module($module) {
	}
}
PHP;
        $source = str_replace(['%%MODULE%%', '%%LOWER%%', '%%IDENT%%'], [$module, $lower, $identifier], $template) . "\n";
        if (file_put_contents("$directory/$module.php", $source) === false) { throw new RuntimeException("Cannot write class file for $module"); }
        chmod("$directory/$module.php", 0644);
    }
    $language = "languages/en_us/$module.php";
    if (!file_exists($language)) {
        $strings = "<?php\n\$languageStrings = array('$module' => '$module');\n\$jsLanguageStrings = array();\n";
        if (file_put_contents($language, $strings) === false) { throw new RuntimeException("Cannot write language file for $module"); }
        chmod($language, 0644);
    }
}

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
    foreach ($schemas as $moduleName => $fields) {
        $module = Vtiger_Module::getInstance($moduleName);
        if (!$module) {
            $module = new Vtiger_Module(); $module->name = $moduleName; $module->parent = 'Support'; $module->save(); $module->initTables();
            $module->initWebservice();
        }
        // Modules loaded from the database do not carry the table names initTables() derives.
        $module->basetable = $module->basetable ?: 'vtiger_' . strtolower($moduleName);
        $module->basetableid = $module->basetableid ?: strtolower($moduleName) . 'id';
        vemsEnsureModuleFiles($moduleName, 'vems_external_key');
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
        $identifier = Vtiger_Field::getInstance('vems_external_key', $module);
        if (!$identifier) { throw new RuntimeException("Entity identifier field missing for $moduleName"); }
        $module->setEntityIdentifier($identifier);
    }
    echo "Vtiger development identity and adapter fields ready; credentials preserved.\n";
} catch (Throwable $e) {
    $message = $e->getMessage();
    foreach (getenv() as $value) { if (is_string($value) && strlen($value) > 5) { $message = str_replace($value, '[REDACTED]', $message); } }
    fwrite(STDERR, get_class($e) . ': ' . $message . "\n");
    fwrite(STDERR, "Vtiger development provisioning failed; no credential details emitted (line " . $e->getLine() . ").\n");
    exit(1);
}
