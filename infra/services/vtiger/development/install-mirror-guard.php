<?php
// Invoked after module creation; source drift must fail provisioning.
require_once '/opt/vems/MirrorGuardHandler.php';
require_once '/opt/vems/ImportGuard.php';

// data/CRMEntity.php of the digest-pinned base image. The guard relies on its save()
// raising vtiger.entity.beforesave.final before saveentity(); drift must be reviewed.
const VEMS_PINNED_CRMENTITY_SHA256 = '32ff1da75c2b721879bc0722e39f689f24ed7e8cdde8a2b3dbccb50319ddcce1';
const VEMS_MIRROR_HANDLER_PATH = 'modules/VEMSVehicles/handlers/VemsMirrorGuard.php';

/** Earlier #148 builds rewrote saveentity(); restore the pinned core source exactly. */
function vemsRemoveCoreMirrorPatch(string $path, string $expectedHash): void {
    $source = file_get_contents($path);
    if ($source === false) throw new RuntimeException('Cannot read CRMEntity save boundary');
    if (strpos($source, 'VemsMirrorGuard') !== false) {
        $signature = "function saveentity(\$module, \$fileid = '') {";
        $end = "\t\t// END\n\t}\n\n\t/**\n\t * This function is used to upload the attachment";
        $source = str_replace([
            $signature . "\n        require_once '/opt/vems/MirrorGuard.php';\n        \$vemsMirrorLock = VemsMirrorGuard::lock(\$this, \$module);\n        try {\n        VemsMirrorGuard::assertSave(\$this, \$module);",
            $signature . "\n        require_once '/opt/vems/MirrorGuard.php';\n        VemsMirrorGuard::assertSave(\$this, \$module);",
            "\t\t// END\n        } finally { VemsMirrorGuard::unlock(\$vemsMirrorLock); }\n\t}\n\n\t/**\n\t * This function is used to upload the attachment",
        ], [$signature, $signature, $end], $source);
        if (hash('sha256', $source) !== $expectedHash) {
            throw new RuntimeException('Unsupported CRMEntity source; core mirror patch was not removed');
        }
        if (file_put_contents($path, $source) === false) throw new RuntimeException('Cannot restore CRMEntity source');
    }
    if (hash_file('sha256', $path) !== $expectedHash) {
        throw new RuntimeException('Unsupported CRMEntity source; save event ordering is unverified');
    }
}

function vemsInstallMirrorGuard($adb, string $expectedCoreHash = VEMS_PINNED_CRMENTITY_SHA256): void {
    vemsRemoveCoreMirrorPatch('data/CRMEntity.php', $expectedCoreHash);
    // vtlib and the webservice dispatcher only include files beneath the CRM document root.
    $handlerDirectory = dirname(VEMS_MIRROR_HANDLER_PATH);
    if (!is_dir($handlerDirectory) && !mkdir($handlerDirectory, 0755, true)) {
        throw new RuntimeException('Cannot create mirror event handler directory');
    }
    $wrappers = [
        'include/Webservices/VemsMirrorWrite.php' => "<?php\nrequire_once '/opt/vems/MirrorGuard.php';\n",
        VEMS_MIRROR_HANDLER_PATH => "<?php\nrequire_once '/opt/vems/MirrorGuardHandler.php';\n",
    ];
    foreach ($wrappers as $path => $source) {
        if (file_put_contents($path, $source) === false) throw new RuntimeException('Cannot install mirror guard wrapper');
    }

    if (!class_exists('Vtiger_Event')) require_once 'vtlib/Vtiger/Event.php';
    $owner = Vtiger_Module::getInstance('VEMSVehicles');
    if (!$owner) throw new RuntimeException('Mirror guard owner module missing');
    foreach ([VemsMirrorGuardHandler::BEFORE, VemsMirrorGuardHandler::AFTER, VemsMirrorGuardHandler::BEFORE_DELETE] as $event) {
        Vtiger_Event::register($owner, $event, VemsMirrorGuardHandler::class, VEMS_MIRROR_HANDLER_PATH);
    }
    (new VTEventsManager($adb))->setHandlerActive(VemsMirrorGuardHandler::class);
    // Vtiger_Event::register skips silently when its file-access check fails.
    $registered = $adb->pquery('SELECT COUNT(*) AS registered FROM vtiger_eventhandlers WHERE handler_class=? AND handler_path=? AND is_active=1 AND event_name IN (?,?,?)',
        [VemsMirrorGuardHandler::class, VEMS_MIRROR_HANDLER_PATH, VemsMirrorGuardHandler::BEFORE, VemsMirrorGuardHandler::AFTER, VemsMirrorGuardHandler::BEFORE_DELETE]);
    if (!$registered || (string)$adb->query_result($registered, 0, 'registered') !== '3') {
        throw new RuntimeException('Mirror event handler registration was not confirmed');
    }

    // UI Import runs in bulk-save mode, which suppresses non-core save handlers.
    $tabIds = [];
    foreach (array_keys(VemsMirrorGuard::registry()) as $moduleName) {
        $module = Vtiger_Module::getInstance($moduleName);
        if (!$module) throw new RuntimeException('Mirrored module missing');
        $module->disableTools('Import');
        $tabIds[] = $module->id;
        // Module-level view override: denies administrators too. Never replace a foreign file.
        $view = "modules/$moduleName/views/Import.php";
        if (file_exists($view) && strpos((string)file_get_contents($view), VEMS_IMPORT_GUARD_MARKER) === false) {
            throw new RuntimeException('Existing Import view override is not the V-EMS import guard');
        }
        if (!is_dir(dirname($view)) && !mkdir(dirname($view), 0755, true)) throw new RuntimeException('Cannot create module views directory');
        if (file_put_contents($view, vemsImportViewSource($moduleName)) === false) throw new RuntimeException('Cannot install import guard view');
    }
    // isPermitted() reads cached user_privileges files; regenerate them from the profiles.
    Vtiger_Access::syncSharingAccess();
    // The scheduled-import cron would still process imports queued before the guard.
    if (Vtiger_Utils::CheckTable('vtiger_import_queue')) {
        $queued = $adb->pquery('SELECT COUNT(*) AS queued FROM vtiger_import_queue WHERE status<>4 AND tabid IN (' . implode(',', array_fill(0, count($tabIds), '?')) . ')', $tabIds);
        if (!$queued || (string)$adb->query_result($queued, 0, 'queued') !== '0') {
            throw new RuntimeException('Pending imports exist for mirrored modules; review them before enabling the guard');
        }
    }

    $result = $adb->pquery('SELECT operationid FROM vtiger_ws_operation WHERE name=?', ['vemsMirrorWrite']);
    if (!$adb->num_rows($result)) {
        $id = vtws_addWebserviceOperation('vemsMirrorWrite', 'include/Webservices/VemsMirrorWrite.php', 'vems_mirror_write', 'POST', 0);
        if (!$id) throw new RuntimeException('Cannot register mirror operation');
        $sequence = 0;
        foreach (['elementType' => 'string', 'element' => 'encoded', 'mode' => 'string', 'writeKey' => 'string'] as $name => $type) {
            if (!vtws_addWebserviceOperationParam($id, $name, $type, ++$sequence)) throw new RuntimeException('Cannot register mirror parameter');
        }
    }
    $adb->pquery('UPDATE vtiger_ws_operation SET handler_path=?,handler_method=?,type=?,prelogin=0 WHERE name=?', ['include/Webservices/VemsMirrorWrite.php', 'vems_mirror_write', 'POST', 'vemsMirrorWrite']);
}
