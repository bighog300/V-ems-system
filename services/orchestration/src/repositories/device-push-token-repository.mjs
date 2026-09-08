import { sqlValue } from "../db.mjs";

function map(row) {
  if (!row) return undefined;
  return { ...row, device_push_token_id: Number(row.device_push_token_id) };
}

export class DevicePushTokenRepository {
  constructor(db) { this.db = db; }

  listByStaffId(staffId) {
    return this.db.queryAll(`SELECT * FROM device_push_tokens WHERE staff_id = ${sqlValue(staffId)} ORDER BY device_push_token_id;`).map(map);
  }

  listByStaffIds(staffIds) {
    if (!staffIds.length) return [];
    const placeholders = staffIds.map((staffId) => sqlValue(staffId)).join(",");
    return this.db.queryAll(`SELECT * FROM device_push_tokens WHERE staff_id IN (${placeholders}) ORDER BY device_push_token_id;`).map(map);
  }

  // Upserts by the push token itself, not (staff_id, token): a token
  // re-registering under a different staff_id (a shared/handed-off device)
  // reassigns ownership rather than leaving a stale row pointed at the
  // previous crew member. device_id is nullable — a session restored from
  // before device identity existed registers without one — and is stored
  // purely as groundwork for Stage 12's device/session-revocation work.
  upsert({ staffId, expoPushToken, platform, deviceId = null, now = new Date().toISOString() }) {
    this.db.execute(`INSERT INTO device_push_tokens (staff_id, expo_push_token, platform, device_id, created_at, updated_at)
      VALUES (${sqlValue(staffId)}, ${sqlValue(expoPushToken)}, ${sqlValue(platform)}, ${sqlValue(deviceId)}, ${sqlValue(now)}, ${sqlValue(now)})
      ON CONFLICT(expo_push_token) DO UPDATE SET
        staff_id = excluded.staff_id, platform = excluded.platform, device_id = excluded.device_id, updated_at = excluded.updated_at;`);
    return map(this.db.queryOne(`SELECT * FROM device_push_tokens WHERE expo_push_token = ${sqlValue(expoPushToken)};`));
  }

  deleteByToken(expoPushToken) {
    this.db.execute(`DELETE FROM device_push_tokens WHERE expo_push_token = ${sqlValue(expoPushToken)};`);
  }
}
