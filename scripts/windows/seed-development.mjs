import { SqliteClient } from '../../services/orchestration/src/db.mjs';
import { OrchestrationService } from '../../services/orchestration/src/index.mjs';
if (process.env.NODE_ENV !== 'development' || process.env.APP_ENV !== 'development' || process.env.VEMS_DB_INIT_MODE !== 'fresh-development') {
  throw new Error('Synthetic seed requires explicit fresh-development mode');
}
const db = new SqliteClient();
await db.execute(`INSERT INTO personnel (staff_id, display_name, role, operational_status, home_station, created_at, updated_at, correlation_id)
VALUES ('STAFF-001', 'Synthetic Development Crew', 'field_crew', 'Available', 'Development', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'windows-development-seed')
ON CONFLICT(staff_id) DO NOTHING`);
// The crew member is inserted directly, so queue its Vtiger mirror; assignments crewed by STAFF-001 wait for that link.
const service = new OrchestrationService({ db });
await service.ensurePersonnelMirror('STAFF-001', { correlationId: 'windows-development-seed' });
console.log('Synthetic development crew fixture ready; no clinical records created.');
