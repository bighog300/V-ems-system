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
    // Rewrite when the file predates readable labels (no SINGLE_ entry), so upgrades converge.
    // Only the custom modules: HelpDesk ships its own language file, which must never be replaced.
    $custom = isset(VEMS_MODULE_LABELS[$module]);
    if (!file_exists($language) || ($custom && strpos(file_get_contents($language), "'SINGLE_$module'") === false)) {
        $label = VEMS_MODULE_LABELS[$module] ?? $module;
        $singular = VEMS_MODULE_SINGULAR[$module] ?? $label;
        $strings = "<?php\n\$languageStrings = array('$module' => '$label', 'SINGLE_$module' => '$singular', 'LBL_VEMS_INFORMATION' => 'V-EMS Information');\n\$jsLanguageStrings = array();\n";
        if (file_put_contents($language, $strings) === false) { throw new RuntimeException("Cannot write language file for $module"); }
        chmod($language, 0644);
    }
}

// Readable names for the custom modules (the menu and record headers otherwise show class names).
const VEMS_MODULE_LABELS = [
    'VEMSAssignments' => 'Assignments', 'VEMSVehicles' => 'Vehicles', 'VEMSPersonnel' => 'Personnel',
    'VEMSAssignmentCrew' => 'Assignment Crew', 'VEMSStockItems' => 'Stock Items',
    'VEMSVehicleStock' => 'Vehicle Stock', 'VEMSStockUsage' => 'Stock Usage',
];
const VEMS_MODULE_SINGULAR = [
    'VEMSAssignments' => 'Assignment', 'VEMSVehicles' => 'Vehicle', 'VEMSPersonnel' => 'Person',
    'VEMSAssignmentCrew' => 'Assignment Crew Member', 'VEMSStockItems' => 'Stock Item',
    'VEMSVehicleStock' => 'Vehicle Stock Line', 'VEMSStockUsage' => 'Stock Usage Record',
];

// Default columns of each module's "All" list. The first column is the record link (external key).
const VEMS_LIST_COLUMNS = [
    'VEMSAssignments' => ['vems_external_key', 'vems_incident_id', 'vems_vehicle_id', 'vems_status', 'vems_vehicle_status', 'vems_updated_at_utc', 'assigned_user_id'],
    'VEMSVehicles' => ['vems_external_key', 'vems_callsign', 'vems_operational_status', 'vems_service_status', 'vems_vehicle_type', 'vems_home_station', 'assigned_user_id'],
    'VEMSPersonnel' => ['vems_external_key', 'vems_display_name', 'vems_role', 'vems_operational_status', 'vems_home_station', 'assigned_user_id'],
    'VEMSAssignmentCrew' => ['vems_external_key', 'vems_assignment_id', 'vems_staff_id', 'vems_updated_at_utc', 'assigned_user_id'],
    'VEMSStockItems' => ['vems_external_key', 'vems_name', 'vems_category', 'vems_item_type', 'vems_unit_of_measure', 'vems_active_status', 'assigned_user_id'],
    'VEMSVehicleStock' => ['vems_external_key', 'vems_vehicle_id', 'vems_stock_item_id', 'vems_quantity_on_hand', 'vems_minimum_quantity', 'vems_target_quantity', 'assigned_user_id'],
    'VEMSStockUsage' => ['vems_external_key', 'vems_stock_item_id', 'vems_quantity_used', 'vems_intervention_type', 'vems_performed_at_utc', 'vems_usage_source', 'assigned_user_id'],
];

// vems_stock_item_id -> "Stock Item ID"; vems_updated_at_utc -> "Updated At UTC".
function vemsFieldLabel(string $name): string
{
    if ($name === 'assigned_user_id') { return 'Assigned To'; }
    $acronyms = ['id' => 'ID', 'utc' => 'UTC', 'ref' => 'Reference', 'no' => 'No'];
    $words = explode('_', preg_replace('/^vems_/', '', $name));
    return implode(' ', array_map(fn ($w) => $acronyms[$w] ?? ucfirst($w), $words));
}

// Stock Vtiger's DetailViewActions.tpl indexes $DETAILVIEW_LINKS['DETAILVIEWBASIC'] without an existence
// check, so any user with no basic links (no edit right) sees a PHP warning on every record. Vtiger
// resolves a per-module template before the shared one, so a guarded copy fixes it without patching core.
function vemsEnsureDetailActionsTemplate(string $module): void
{
    $source = 'layouts/v7/modules/Vtiger/DetailViewActions.tpl';
    $directory = "layouts/v7/modules/$module";
    $target = "$directory/DetailViewActions.tpl";
    $needle = "\$DETAILVIEW_LINKS['DETAILVIEWBASIC']}";
    $original = file_get_contents($source);
    if ($original === false || strpos($original, $needle) === false) { throw new RuntimeException('Unexpected DetailViewActions.tpl; template guard not applied'); }
    $guarded = str_replace($needle, "\$DETAILVIEW_LINKS['DETAILVIEWBASIC']|default:[]}", $original);
    if (file_exists($target) && file_get_contents($target) === $guarded) { return; }
    if (!is_dir($directory) && !mkdir($directory, 0755, true)) { throw new RuntimeException("Cannot create layout directory for $module"); }
    if (file_put_contents($target, $guarded) === false) { throw new RuntimeException("Cannot write detail actions template for $module"); }
    chmod($target, 0644);
}

// HelpDesk's summary template tests {if $DOCUMENT_WIDGET_MODEL} (and the comments/updates twins) on variables
// it only assigns when the user's role is offered that widget, so read-only roles see "Undefined array key" and
// "property value on null" warnings on every ticket. Initialise them first. Marker-guarded and idempotent.
function vemsEnsureHelpDeskSummaryGuard(): void
{
    $path = 'layouts/v7/modules/HelpDesk/SummaryViewWidgets.tpl';
    $marker = '{* VEMS: widget variables initialised *}';
    $original = file_get_contents($path);
    if ($original === false) { throw new RuntimeException('HelpDesk SummaryViewWidgets.tpl not found; template guard not applied'); }
    if (strpos($original, $marker) !== false) { return; }
    $needle = "{strip}\n";
    $position = strpos($original, $needle);
    if ($position === false) { throw new RuntimeException('Unexpected HelpDesk SummaryViewWidgets.tpl; template guard not applied'); }
    $init = $needle . $marker . "\n{assign var=DOCUMENT_WIDGET_MODEL value=null}\n{assign var=COMMENTS_WIDGET_MODEL value=null}\n{assign var=UPDATES_WIDGET_MODEL value=null}\n";
    if (file_put_contents($path, substr_replace($original, $init, $position, strlen($needle))) === false) { throw new RuntimeException('Cannot write HelpDesk summary template'); }
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
        // vtlib module creation ships no default "All" filter. Without one, every
        // account's List view (including the admin's) is a fatal error: the page
        // calls a method on the null custom-view object that getViewId() resolves
        // to. Match the shape of a standard module's system "All" view exactly.
        $existingView = $adb->pquery('SELECT cvid FROM vtiger_customview WHERE viewname=? AND entitytype=?', ['All', $moduleName]);
        if (!$adb->num_rows($existingView)) {
            $cvid = $adb->getUniqueId('vtiger_customview');
            $adb->pquery('INSERT INTO vtiger_customview (cvid, viewname, setdefault, setmetrics, entitytype, status, userid) VALUES (?,?,1,0,?,0,1)', [$cvid, 'All', $moduleName]);
        }
        if (isset(VEMS_LIST_COLUMNS[$moduleName])) {
            // Fields are created with their raw names as labels; give ours readable ones (only when
            // the label is still the raw name, so Vtiger's own field labels are never touched).
            foreach ($fields as $name) {
                $adb->pquery('UPDATE vtiger_field SET fieldlabel=? WHERE tabid=? AND fieldname=? AND fieldlabel=fieldname', [vemsFieldLabel($name), $module->id, $name]);
            }
            // The default view needs column rows or every cell and header renders blank. Only add them
            // when none exist, so an administrator's later column changes survive re-provisioning.
            $filter = Vtiger_Filter::getInstance('All', $module);
            $hasColumns = $adb->num_rows($adb->pquery('SELECT 1 FROM vtiger_cvcolumnlist WHERE cvid=?', [$filter->id])) > 0;
            if (!$hasColumns) {
                foreach (VEMS_LIST_COLUMNS[$moduleName] as $index => $columnName) {
                    $column = Vtiger_Field::getInstance($columnName, $module);
                    if ($column) { $filter->addField($column, $index); }
                }
            }
            // vtlib module creation leaves no default organisation-sharing row, so Vtiger's permission
            // check reads an undefined index for non-administrators. Match HelpDesk (Public: Read, Create/Edit,
            // Delete); writes are still controlled by profiles and the mirror guard.
            if (!$adb->num_rows($adb->pquery('SELECT 1 FROM vtiger_def_org_share WHERE tabid=?', [$module->id]))) {
                Vtiger_Access::setDefaultSharing($module, 'Public_ReadWriteDelete');
            }
        }
        vemsEnsureDetailActionsTemplate($moduleName);
    }
    vemsEnsureHelpDeskSummaryGuard();
    require_once '/opt/vems/install-mirror-guard.php';
    vemsInstallMirrorGuard($adb);
    echo "Vtiger development identity, fields and mirror guard ready; credentials preserved.\n";
} catch (Throwable $e) {
    $message = $e->getMessage();
    foreach (getenv() as $value) { if (is_string($value) && strlen($value) > 5) { $message = str_replace($value, '[REDACTED]', $message); } }
    fwrite(STDERR, get_class($e) . ': ' . $message . "\n");
    fwrite(STDERR, "Vtiger development provisioning failed; no credential details emitted (line " . $e->getLine() . ").\n");
    exit(1);
}
