<?php
/** Shared persistence guard: UI, webservice and bulk saves all pass saveentity(). */
final class VemsMirrorGuard {
    private static $permit = null;

    public static function registry(): array {
        return json_decode(file_get_contents('/opt/vems/field-ownership.json'), true, 512, JSON_THROW_ON_ERROR)['modules'];
    }

    public static function lock($entity, string $module) {
        if (!isset(self::registry()[$module])) return null;
        global $adb;
        // The pinned distribution's startTransaction enables autocommit. Use a
        // connection-scoped lock across comparison AND persistence instead.
        $name = 'vems-mirror-' . substr(hash('sha256', $module . ':' . ($entity->id ?? 'new')), 0, 48);
        $result = $adb->pquery('SELECT GET_LOCK(?, 10) AS acquired', [$name]);
        if (!$result || (string)$adb->query_result($result, 0, 'acquired') !== '1') self::deny();
        return [$adb, $name];
    }

    public static function unlock($lock): void {
        if ($lock !== null) $lock[0]->pquery('SELECT RELEASE_LOCK(?)', [$lock[1]]);
    }

    public static function assertSave($entity, string $module): void {
        $registry = self::registry();
        if (!isset($registry[$module])) return;
        $id = empty($entity->id) ? null : (string)$entity->id;
        if (self::$permit !== null && self::$permit === [$module, $id]) {
            // Consume before persistence: nested workflow saves do not inherit permission.
            self::$permit = null;
            return;
        }
        $before = [];
        if ($id !== null) {
            $stored = CRMEntity::getInstance($module);
            $stored->retrieve_entity_info($id, $module);
            $before = $stored->column_fields;
        }
        foreach ($registry[$module]['fields'] as $field => $owner) {
            if ($owner !== 'vems_mirror') continue;
            $next = $entity->column_fields[$field] ?? '';
            $old = $before[$field] ?? '';
            if ((string)$next !== (string)$old) self::deny();
        }
    }

    public static function deny(): void {
        if (class_exists('WebServiceException')) throw new WebServiceException('ACCESS_DENIED', 'V-EMS mirrored fields require the authenticated mirror write operation');
        throw new RuntimeException('V-EMS mirrored fields require the authenticated mirror write operation');
    }

    public static function write($elementType, $element, $mode, $writeKey, $user) {
        $secret = getenv('VTIGER_MIRROR_WRITE_KEY');
        if (!is_string($secret) || strlen($secret) < 32 || !is_string($writeKey) ||
            !hash_equals($secret, $writeKey) || empty($user->id) ||
            $user->user_name !== getenv('VTIGER_USERNAME')) self::deny();
        if (!isset(self::registry()[$elementType]) || !is_array($element) || !in_array($mode, ['create', 'update'], true)) self::deny();
        $id = null;
        if ($mode === 'update') {
            global $adb;
            $parts = vtws_getIdComponents($element['id'] ?? '');
            $object = VtigerWebserviceObject::fromId($adb, $parts[0]);
            if ($object->getEntityName() !== $elementType) self::deny();
            $id = (string)$parts[1];
        } elseif (!empty($element['id'])) self::deny();
        self::$permit = [$elementType, $id];
        try {
            require_once 'include/Webservices/Create.php';
            require_once 'include/Webservices/Update.php';
            return $mode === 'create' ? vtws_create($elementType, $element, $user) : vtws_update($element, $user);
        } finally {
            self::$permit = null;
        }
    }
}

function vems_mirror_write($elementType, $element, $mode, $writeKey, $user) {
    return VemsMirrorGuard::write($elementType, $element, $mode, $writeKey, $user);
}
