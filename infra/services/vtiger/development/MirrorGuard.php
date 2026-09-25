<?php
/**
 * Mirror guard invoked from the supported vtlib save events (see MirrorGuardHandler.php).
 * CRMEntity::save() raises vtiger.entity.beforesave.final before saveentity(), so the
 * comparison precedes persistence for UI record-model, webservice and mass-edit saves.
 * Bulk-save mode (UI Import) and direct saveentity()/SQL callers raise no events.
 *
 * Mirrored records are written only by the authenticated mirror operation: every create outside it is
 * denied (even with all mirror fields blank, which would otherwise leave an orphan record) and every
 * delete is denied (vtiger.entity.beforedelete; the worker has no delete operation).
 */
final class VemsMirrorGuard {
    private static $permit = null;
    private static $locks = [];

    public static function registry(): array {
        return json_decode(file_get_contents('/opt/vems/field-ownership.json'), true, 512, JSON_THROW_ON_ERROR)['modules'];
    }

    public static function lock($entity, string $module) {
        // A create has no stored mirror values to race against.
        if (!isset(self::registry()[$module]) || empty($entity->id)) return null;
        global $adb;
        // The pinned distribution's startTransaction enables autocommit. Use a
        // connection-scoped lock across comparison AND persistence instead.
        $name = 'vems-mirror-' . substr(hash('sha256', $module . ':' . $entity->id), 0, 48);
        $result = $adb->pquery('SELECT GET_LOCK(?, 10) AS acquired', [$name]);
        if (!$result || (string)$adb->query_result($result, 0, 'acquired') !== '1') self::deny();
        return [$adb, $name];
    }

    public static function unlock($lock): void {
        if ($lock !== null) $lock[0]->pquery('SELECT RELEASE_LOCK(?)', [$lock[1]]);
    }

    /** vtiger.entity.beforesave.final: lock, compare, and hold the lock until aftersave. */
    public static function beforeSave($entity, string $module): void {
        $lock = self::lock($entity, $module);
        try {
            self::assertSave($entity, $module);
        } catch (Throwable $error) {
            self::unlock($lock);
            throw $error;
        }
        if ($lock === null) return;
        if (!self::$locks) register_shutdown_function([self::class, 'releaseAll']);
        self::$locks[spl_object_id($entity)] = $lock;
    }

    /** vtiger.entity.aftersave: persistence finished for this entity. */
    public static function afterSave($entity): void {
        $key = spl_object_id($entity);
        if (!isset(self::$locks[$key])) return;
        $lock = self::$locks[$key];
        unset(self::$locks[$key]);
        self::unlock($lock);
    }

    /** A failed saveentity() raises no aftersave; release before the connection is reused. */
    public static function releaseAll(): void {
        while (self::$locks) self::unlock(array_pop(self::$locks));
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
        // A create outside the mirror operation is never allowed. Comparing fields alone let a create with
        // every mirror-owned field blank through, leaving an orphan record with no V-EMS counterpart.
        if ($id === null) self::deny();
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

    /** vtiger.entity.beforedelete: mirrored records are never deleted from Vtiger, by anyone. */
    public static function beforeDelete($entity, string $module): void {
        if (isset(self::registry()[$module])) self::deny(' (mirrored records cannot be deleted)');
    }

    public static function deny(string $detail = ''): void {
        $message = 'V-EMS mirrored fields require the authenticated mirror write operation' . $detail;
        if (class_exists('WebServiceException')) throw new WebServiceException('ACCESS_DENIED', $message);
        throw new RuntimeException($message);
    }

    public static function write($elementType, $element, $mode, $writeKey, $user) {
        $secret = getenv('VTIGER_MIRROR_WRITE_KEY');
        if (!is_string($secret) || strlen($secret) < 32 || !is_string($writeKey) ||
            !hash_equals($secret, $writeKey) || empty($user->id) ||
            $user->user_name !== getenv('VTIGER_USERNAME')) self::deny();
        if (!isset(self::registry()[$elementType]) || !is_array($element) || !in_array($mode, ['create', 'update'], true)) self::deny();
        // The permit is only honoured by the save event; bulk mode would skip it silently.
        if (class_exists('CRMEntity') && CRMEntity::isBulkSaveMode()) self::deny();
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
