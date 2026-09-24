<?php
// Invoked after module creation; source drift must fail provisioning.
function vemsInstallMirrorGuard($adb): void {
    // The dispatcher only includes handlers beneath the CRM document root.
    if (file_put_contents('include/Webservices/VemsMirrorWrite.php', "<?php\nrequire_once '/opt/vems/MirrorGuard.php';\n") === false) {
        throw new RuntimeException('Cannot install mirror operation handler');
    }
    $path = 'data/CRMEntity.php';
    $source = file_get_contents($path);
    $signature = "function saveentity(\$module, \$fileid = '') {";
    $legacy = "\n        require_once '/opt/vems/MirrorGuard.php';\n        VemsMirrorGuard::assertSave(\$this, \$module);";
    $injection = "\n        require_once '/opt/vems/MirrorGuard.php';\n        \$vemsMirrorLock = VemsMirrorGuard::lock(\$this, \$module);\n        try {\n        VemsMirrorGuard::assertSave(\$this, \$module);";
    $end = "\t\t// END\n\t}\n\n\t/**\n\t * This function is used to upload the attachment";
    $guardedEnd = "\t\t// END\n        } finally { VemsMirrorGuard::unlock(\$vemsMirrorLock); }\n\t}\n\n\t/**\n\t * This function is used to upload the attachment";
    if (strpos($source, $signature . $injection) === false || strpos($source, $guardedEnd) === false) {
        // Upgrade the earlier audit-only hook without touching any record data.
        $source = str_replace($signature . $legacy, $signature, $source);
        if (substr_count($source, $signature) !== 1 || substr_count($source, $end) !== 1 || strpos($source, 'VemsMirrorGuard::assertSave') !== false) {
            throw new RuntimeException('Unsupported CRMEntity save boundary; mirror guard was not installed');
        }
        $source = str_replace([$signature, $end], [$signature . $injection, $guardedEnd], $source);
        if (file_put_contents($path, $source) === false) {
            throw new RuntimeException('Cannot install mirror save guard');
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
