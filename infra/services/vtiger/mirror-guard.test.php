<?php
// Run with PHP 8 against the same /opt/vems files packaged in the Vtiger image.
require '/opt/vems/MirrorGuard.php';
require '/opt/vems/install-mirror-guard.php';
class LockDatabase {
    public $acquired = '1';
    public $calls = [];
    public function pquery($sql, $params) { $this->calls[] = [$sql, $params]; return true; }
    public function query_result($result, $row, $field) { return $this->acquired; }
    public function num_rows($result) { return 1; }
}
class CRMEntity {
    public static $stored = [];
    public $column_fields = [];
    public static function getInstance($module) { return new self(); }
    public function retrieve_entity_info($id, $module) { $this->column_fields = self::$stored; }
}
function denied($fn) {
    try { $fn(); } catch (RuntimeException $e) {
        if (str_contains($e->getMessage(), 'V-EMS mirrored fields')) return;
        throw $e;
    }
    throw new RuntimeException('Expected denial');
}
$checks = 0;
$originalDirectory = getcwd();
$fixtureDirectory = sys_get_temp_dir() . '/vems-guard-test-' . bin2hex(random_bytes(8));
mkdir($fixtureDirectory . '/data', 0700, true);
mkdir($fixtureDirectory . '/include/Webservices', 0700, true);
chdir($fixtureDirectory);
$fixture = "<?php\nclass Fixture {\nfunction saveentity(\$module, \$fileid = '') {\n\t\t// END\n\t}\n\n\t/**\n\t * This function is used to upload the attachment\n */\n}\n";
file_put_contents('data/CRMEntity.php', $fixture);
vemsInstallMirrorGuard(new LockDatabase());
$installed = file_get_contents('data/CRMEntity.php');
vemsInstallMirrorGuard(new LockDatabase());
if ($installed !== file_get_contents('data/CRMEntity.php') || !str_contains($installed, 'finally { VemsMirrorGuard::unlock')) throw new RuntimeException('Installer is not idempotent or does not release locks');
file_put_contents('data/CRMEntity.php', '<?php // incompatible source');
try { vemsInstallMirrorGuard(new LockDatabase()); throw new LogicException('Source drift was accepted'); }
catch (RuntimeException $error) { if (!str_contains($error->getMessage(), 'Unsupported CRMEntity')) throw $error; }
chdir($originalDirectory);
$adb = new LockDatabase();
$lock = VemsMirrorGuard::lock((object)['id' => 123], 'VEMSVehicles');
VemsMirrorGuard::unlock($lock);
if (count($adb->calls) !== 2 || $adb->calls[0][1] !== $adb->calls[1][1]) throw new RuntimeException('Lock not released');
$adb->acquired = '0';
denied(fn() => VemsMirrorGuard::lock((object)['id' => 123], 'VEMSVehicles'));
if (VemsMirrorGuard::lock((object)[], 'Accounts') !== null) throw new RuntimeException('Unrelated module locked');
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
echo "Mirror guard: $checks fields, create/change/clear denial, metadata and authentication checks passed\n";
