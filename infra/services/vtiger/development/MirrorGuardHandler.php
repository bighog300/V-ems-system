<?php
// vtlib event handler; registered by install-mirror-guard.php through Vtiger_Event::register.
if (!class_exists('VTEventHandler')) require_once 'include/events/VTEventHandler.inc';
require_once '/opt/vems/MirrorGuard.php';

class VemsMirrorGuardHandler extends VTEventHandler {
    const BEFORE = 'vtiger.entity.beforesave.final';
    const AFTER = 'vtiger.entity.aftersave';

    public function handleEvent($name, $data) {
        if ($name === self::BEFORE) VemsMirrorGuard::beforeSave($data->focus, $data->getModuleName());
        elseif ($name === self::AFTER) VemsMirrorGuard::afterSave($data->focus);
    }
}
