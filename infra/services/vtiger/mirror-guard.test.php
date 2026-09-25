<?php
// Run with PHP 8 against the same /opt/vems files packaged in the Vtiger image.
abstract class VTEventHandler { abstract public function handleEvent($name, $data); }
class GuardDatabase {
    public $acquired = '1';
    public $registered = '3';
    public $queued = '0';
    public $calls = [];
    public function pquery($sql, $params) { $this->calls[] = [$sql, $params]; return true; }
    public function query_result($result, $row, $field) { return $this->$field ?? $this->acquired; }
    public function num_rows($result) { return 1; }
}
class CRMEntity {
    public static $stored = [];
    public static $bulk = false;
    public $column_fields = [];
    public static function isBulkSaveMode() { return self::$bulk; }
    public static function getInstance($module) { return new self(); }
    public function retrieve_entity_info($id, $module) { $this->column_fields = self::$stored; }
}
class Vtiger_Module {
    public static $disabled = [];
    public $name;
    public $id;
    public static function getInstance($name) { $module = new self(); $module->name = $name; $module->id = crc32($name); return $module; }
    public function disableTools($tool) { self::$disabled[$this->name] = $tool; }
}
class Vtiger_Utils {
    public static function CheckTable($table) { return $table === 'vtiger_import_queue'; }
}
class Vtiger_Request { public function getMode() { return 'import'; } }
class AppException extends Exception {}
class Vtiger_Import_View { public function checkPermission(Vtiger_Request $request) { return true; } public function process(Vtiger_Request $request) { return 'imported'; } }
function vtranslate($label) { return $label; }
class Vtiger_Event {
    public static $registered = [];
    public static function register($module, $event, $class, $path) { self::$registered[] = [$module->name, $event, $class, $path]; }
}
class Vtiger_Access {
    public static $synced = 0;
    public static function syncSharingAccess() { self::$synced++; }
}
class VTEventsManager {
    public static $active = [];
    public function __construct($adb) {}
    public function setHandlerActive($class) { self::$active[] = $class; }
}
require '/opt/vems/MirrorGuard.php';
require '/opt/vems/MirrorGuardHandler.php';
require '/opt/vems/install-mirror-guard.php';
function denied($fn) {
    try { $fn(); } catch (RuntimeException $e) {
        if (str_contains($e->getMessage(), 'V-EMS mirrored fields')) return;
        throw $e;
    }
    throw new RuntimeException('Expected denial');
}
function expectFailure($fn, string $message) {
    try { $fn(); } catch (RuntimeException $e) {
        if (str_contains($e->getMessage(), $message)) return;
        throw $e;
    }
    throw new LogicException('Expected failure: ' . $message);
}
$checks = 0;

// Installer: supported event registration, no core rewrite, legacy patch removal.
$originalDirectory = getcwd();
$fixtureDirectory = sys_get_temp_dir() . '/vems-guard-test-' . bin2hex(random_bytes(8));
mkdir($fixtureDirectory . '/data', 0700, true);
mkdir($fixtureDirectory . '/include/Webservices', 0700, true);
mkdir($fixtureDirectory . '/modules/VEMSVehicles', 0700, true);
chdir($fixtureDirectory);
$pristine = "<?php\nclass Fixture {\nfunction saveentity(\$module, \$fileid = '') {\n\t\t\$work = 1;\n\t\t// END\n\t}\n\n\t/**\n\t * This function is used to upload the attachment\n */\n}\n";
$pristineHash = hash('sha256', $pristine);
file_put_contents('data/CRMEntity.php', $pristine);
$adb = new GuardDatabase();
vemsInstallMirrorGuard($adb, $pristineHash);
vemsInstallMirrorGuard($adb, $pristineHash);
if (file_get_contents('data/CRMEntity.php') !== $pristine) throw new RuntimeException('Installer modified core source');
$expected = [];
foreach ([1, 2] as $run) foreach (['vtiger.entity.beforesave.final', 'vtiger.entity.aftersave', 'vtiger.entity.beforedelete'] as $event) {
    $expected[] = ['VEMSVehicles', $event, 'VemsMirrorGuardHandler', 'modules/VEMSVehicles/handlers/VemsMirrorGuard.php'];
}
if (Vtiger_Event::$registered !== $expected) throw new RuntimeException('Handler not registered for the save events');
if (VTEventsManager::$active !== ['VemsMirrorGuardHandler', 'VemsMirrorGuardHandler']) throw new RuntimeException('Handler not activated');
if (array_keys(Vtiger_Module::$disabled) !== array_keys(VemsMirrorGuard::registry()) || array_unique(Vtiger_Module::$disabled) !== ['HelpDesk' => 'Import']) throw new RuntimeException('Import not disabled for every mirrored module');
if (Vtiger_Access::$synced !== 2) throw new RuntimeException('Cached user privileges not regenerated');
if (!str_contains(file_get_contents('modules/VEMSVehicles/handlers/VemsMirrorGuard.php'), '/opt/vems/MirrorGuardHandler.php')) throw new RuntimeException('Handler wrapper missing');
$adb->registered = '2';
expectFailure(fn() => vemsInstallMirrorGuard($adb, $pristineHash), 'registration was not confirmed');
$adb->registered = '3';
// Module-level Import override for every registry module; it denies every user and mode.
foreach (array_keys(VemsMirrorGuard::registry()) as $module) {
    $view = "modules/$module/views/Import.php";
    if (file_get_contents($view) !== vemsImportViewSource($module)) throw new RuntimeException("Import guard view missing for $module");
    require $view;
    $class = "{$module}_Import_View";
    $instance = new $class();
    foreach (['checkPermission', 'process'] as $method) {
        try { $instance->$method(new Vtiger_Request()); throw new LogicException("$class::$method allowed import"); }
        catch (AppException $denied) { if ($denied->getMessage() !== 'LBL_PERMISSION_DENIED') throw $denied; }
    }
}
expectFailure(fn() => vemsImportViewSource('Bad/../Module'), 'Invalid module name');
$queuedCheck = array_values(array_filter($adb->calls, fn($call) => str_contains($call[0], 'vtiger_import_queue')));
if (!$queuedCheck || count(end($queuedCheck)[1]) !== count(VemsMirrorGuard::registry())) throw new RuntimeException('Import queue not checked for every module');
$adb->queued = '1';
expectFailure(fn() => vemsInstallMirrorGuard($adb, $pristineHash), 'Pending imports exist');
$adb->queued = '0';
$foreign = 'modules/VEMSStockUsage/views/Import.php';
file_put_contents($foreign, "<?php // custom module view\n");
expectFailure(fn() => vemsInstallMirrorGuard($adb, $pristineHash), 'not the V-EMS import guard');
if (file_get_contents($foreign) !== "<?php // custom module view\n") throw new RuntimeException('Foreign Import view overwritten');
unlink($foreign);
// Both earlier #148 core rewrites are reverted byte-for-byte.
$signature = "function saveentity(\$module, \$fileid = '') {";
$end = "\t\t// END\n\t}\n\n\t/**\n\t * This function is used to upload the attachment";
foreach ([
    str_replace($signature, $signature . "\n        require_once '/opt/vems/MirrorGuard.php';\n        VemsMirrorGuard::assertSave(\$this, \$module);", $pristine),
    str_replace([$signature, $end], [$signature . "\n        require_once '/opt/vems/MirrorGuard.php';\n        \$vemsMirrorLock = VemsMirrorGuard::lock(\$this, \$module);\n        try {\n        VemsMirrorGuard::assertSave(\$this, \$module);", "\t\t// END\n        } finally { VemsMirrorGuard::unlock(\$vemsMirrorLock); }\n\t}\n\n\t/**\n\t * This function is used to upload the attachment"], $pristine),
] as $patched) {
    file_put_contents('data/CRMEntity.php', $patched);
    vemsInstallMirrorGuard($adb, $pristineHash);
    if (file_get_contents('data/CRMEntity.php') !== $pristine) throw new RuntimeException('Legacy core patch not removed');
}
file_put_contents('data/CRMEntity.php', str_replace('$work = 1;', '$work = 2; VemsMirrorGuard::x();', $pristine));
expectFailure(fn() => vemsInstallMirrorGuard($adb, $pristineHash), 'core mirror patch was not removed');
file_put_contents('data/CRMEntity.php', '<?php // incompatible source');
expectFailure(fn() => vemsInstallMirrorGuard($adb, $pristineHash), 'save event ordering is unverified');
chdir($originalDirectory);

// Locks: updates only, released after save, on denial and at shutdown.
$adb = new GuardDatabase();
$lock = VemsMirrorGuard::lock((object)['id' => 123], 'VEMSVehicles');
VemsMirrorGuard::unlock($lock);
if (count($adb->calls) !== 2 || $adb->calls[0][1] !== $adb->calls[1][1]) throw new RuntimeException('Lock not released');
if (VemsMirrorGuard::lock((object)['id' => null], 'VEMSVehicles') !== null) throw new RuntimeException('Create locked');
if (VemsMirrorGuard::lock((object)['id' => 1], 'Accounts') !== null) throw new RuntimeException('Unrelated module locked');
$adb->acquired = '0';
denied(fn() => VemsMirrorGuard::lock((object)['id' => 123], 'VEMSVehicles'));
$adb->acquired = '1';
$releases = fn() => count(array_filter($adb->calls, fn($call) => str_contains($call[0], 'RELEASE_LOCK')));
$handler = new VemsMirrorGuardHandler();
$event = fn($focus) => new class($focus) { public $focus; public function __construct($focus) { $this->focus = $focus; } public function getModuleName() { return 'VEMSVehicles'; } };
CRMEntity::$stored = ['vems_operational_status' => 'Available'];
$adb->calls = [];
$saved = (object)['id' => '123', 'column_fields' => ['vems_operational_status' => 'Available']];
$data = $event($saved);
$handler->handleEvent('vtiger.entity.beforesave.final', $data);
if ($releases() !== 0) throw new RuntimeException('Lock released before persistence');
$handler->handleEvent('vtiger.entity.aftersave', $data);
if ($releases() !== 1) throw new RuntimeException('Lock not released after save');
$handler->handleEvent('vtiger.entity.aftersave', $data);
if ($releases() !== 1) throw new RuntimeException('Lock released twice');
$adb->calls = [];
$changed = $event((object)['id' => '123', 'column_fields' => ['vems_operational_status' => 'Out of Service']]);
denied(fn() => $handler->handleEvent('vtiger.entity.beforesave.final', $changed));
if ($releases() !== 1) throw new RuntimeException('Lock held after denial');
$adb->calls = [];
$handler->handleEvent('vtiger.entity.beforesave.final', $event((object)['id' => '124', 'column_fields' => ['vems_operational_status' => 'Available']]));
VemsMirrorGuard::releaseAll();
if ($releases() !== 1) throw new RuntimeException('Failed save lock not released');
$adb->calls = [];
$handler->handleEvent('vtiger.entity.beforesave', $changed);
if ($adb->calls) throw new RuntimeException('Handler acted on an unregistered event');

// Every classified field: mirror fields reject create/change/clear, others pass.
foreach (VemsMirrorGuard::registry() as $module => $definition) {
    foreach ($definition['fields'] as $field => $owner) {
        CRMEntity::$stored = [$field => 'original'];
        $entity = (object)['id' => '123', 'column_fields' => [$field => 'original']];
        VemsMirrorGuard::assertSave($entity, $module);
        $entity->column_fields[$field] = 'changed';
        if ($owner === 'vems_mirror') {
            denied(fn() => VemsMirrorGuard::assertSave($entity, $module));
            $entity->column_fields[$field] = '';
            denied(fn() => VemsMirrorGuard::assertSave($entity, $module));
            $entity->id = null;
            $entity->column_fields[$field] = 'created';
            denied(fn() => VemsMirrorGuard::assertSave($entity, $module));
        } else VemsMirrorGuard::assertSave($entity, $module);
        $checks++;
    }
}
VemsMirrorGuard::assertSave((object)['column_fields' => ['name' => 'ordinary']], 'Accounts');
// Neither request flags nor administrator identity grant a persistence permit.
$_REQUEST = ['operation' => 'vemsMirrorWrite', 'vems_mirror_write' => true];
$current_user = (object)['id' => 1, 'is_admin' => 'on'];
CRMEntity::$stored = ['vems_operational_status' => 'Available'];
$entity = (object)['id' => '123', 'column_fields' => ['vems_operational_status' => 'Out of Service']];
denied(fn() => VemsMirrorGuard::assertSave($entity, 'VEMSVehicles'));
// Verify the internal grant is scoped and consumed, independent of HTTP fixtures.
$permit = new ReflectionProperty(VemsMirrorGuard::class, 'permit');
$permit->setValue(null, ['VEMSVehicles', '999']);
denied(fn() => VemsMirrorGuard::assertSave($entity, 'VEMSVehicles'));
$permit->setValue(null, ['VEMSVehicles', '123']);
VemsMirrorGuard::assertSave($entity, 'VEMSVehicles');
denied(fn() => VemsMirrorGuard::assertSave($entity, 'VEMSVehicles'));
putenv('VTIGER_MIRROR_WRITE_KEY=' . str_repeat('k', 40));
putenv('VTIGER_USERNAME=worker');
foreach (['', 'bad', str_repeat('x', 40)] as $key) {
    denied(fn() => VemsMirrorGuard::write('VEMSVehicles', [], 'create', $key, (object)['id' => 2, 'user_name' => 'worker']));
}
denied(fn() => VemsMirrorGuard::write('VEMSVehicles', [], 'create', str_repeat('k',40), (object)['id' => 1, 'user_name' => 'admin']));
denied(fn() => VemsMirrorGuard::write('Accounts', [], 'create', str_repeat('k',40), (object)['id' => 2, 'user_name' => 'worker']));
denied(fn() => VemsMirrorGuard::write('VEMSVehicles', [], 'delete', str_repeat('k',40), (object)['id' => 2, 'user_name' => 'worker']));
// Bulk-save mode skips the event that consumes the permit, so it is refused outright.
CRMEntity::$bulk = true;
denied(fn() => VemsMirrorGuard::write('VEMSVehicles', [], 'create', str_repeat('k',40), (object)['id' => 2, 'user_name' => 'worker']));
CRMEntity::$bulk = false;
// #148 follow-up: a create is denied for every mirrored module unless the worker's permit covers it,
// even when every mirror-owned field is blank (the Integration user's Add Record path).
$permit->setValue(null, null);
foreach (array_keys(VemsMirrorGuard::registry()) as $module) {
    denied(fn() => VemsMirrorGuard::assertSave((object)['id' => null, 'column_fields' => []], $module));
    denied(fn() => VemsMirrorGuard::assertSave((object)['column_fields' => ['assigned_user_id' => '5']], $module));
    $checks++;
}
// A creating permit is honoured once, only for its module, and only for a create.
$permit->setValue(null, ['VEMSVehicles', null]);
VemsMirrorGuard::assertSave((object)['id' => null, 'column_fields' => ['vems_vehicle_id' => 'AMB-1']], 'VEMSVehicles');
denied(fn() => VemsMirrorGuard::assertSave((object)['id' => null, 'column_fields' => []], 'VEMSVehicles'));
$permit->setValue(null, ['VEMSVehicles', null]);
denied(fn() => VemsMirrorGuard::assertSave((object)['id' => null, 'column_fields' => []], 'VEMSPersonnel'));
$permit->setValue(null, ['VEMSVehicles', null]);
denied(fn() => VemsMirrorGuard::assertSave((object)['id' => '123', 'column_fields' => ['vems_operational_status' => 'Out of Service']], 'VEMSVehicles'));
$permit->setValue(null, null);
// Unmirrored modules keep creating normally.
VemsMirrorGuard::assertSave((object)['id' => null, 'column_fields' => ['accountname' => 'Ordinary']], 'Accounts');
// Deletes: denied for every mirrored module, including through the vtlib event; other modules unaffected.
foreach (array_keys(VemsMirrorGuard::registry()) as $module) {
    denied(fn() => VemsMirrorGuard::beforeDelete((object)['id' => '123'], $module));
    $deleteEvent = new class((object)['id' => '123'], $module) { public $focus; private $module; public function __construct($focus, $module) { $this->focus = $focus; $this->module = $module; } public function getModuleName() { return $this->module; } };
    denied(fn() => $handler->handleEvent('vtiger.entity.beforedelete', $deleteEvent));
    $checks++;
}
VemsMirrorGuard::beforeDelete((object)['id' => '55'], 'Accounts');
// The worker cannot be used to delete either (the operation only accepts create and update).
denied(fn() => VemsMirrorGuard::write('VEMSVehicles', ['id' => '37x1'], 'delete', str_repeat('k', 40), (object)['id' => 2, 'user_name' => 'worker']));
$adb->calls = [];
$handler->handleEvent('vtiger.entity.afterdelete', $event((object)['id' => '123', 'column_fields' => []]));
if ($adb->calls) throw new RuntimeException('Handler acted on an unregistered delete event');
echo "Mirror guard: $checks fields, event registration/ordering, core patch removal, Import view override, lock release, create/change/clear denial, blank-create denial, delete denial and authentication checks passed\n";
