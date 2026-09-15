// Stage 13 milestone 13f: the first read surface over audit_logs. Every
// row has been written since the platform's earliest migrations (via
// OrchestrationService#audit()), but nothing before this milestone could
// query it back out -- AuditLogRepository only ever had append(), and no
// endpoint exposed it.
//
// Filtered and keyset-paginated (ORDER BY id DESC, id < before_id) rather
// than offset pagination, since an audit trail is written to continuously
// and offset pagination silently skips/repeats rows under concurrent
// writes; a keyset cursor doesn't have that problem.

import { sqlValue } from "../db.mjs";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function whereClause({ entityType, entityId, actorId, action, from, to, beforeId }) {
  const clauses = [];
  if (entityType) clauses.push(`entity_type = ${sqlValue(entityType)}`);
  if (entityId) clauses.push(`entity_id = ${sqlValue(entityId)}`);
  if (actorId) clauses.push(`actor_id = ${sqlValue(actorId)}`);
  if (action) clauses.push(`action = ${sqlValue(action)}`);
  if (from) clauses.push(`timestamp >= ${sqlValue(from)}`);
  if (to) clauses.push(`timestamp <= ${sqlValue(to)}`);
  const beforeIdNumber = Number(beforeId);
  if (beforeId !== undefined && beforeId !== null && Number.isFinite(beforeIdNumber)) clauses.push(`id < ${sqlValue(beforeIdNumber)}`);
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

export async function getAuditLogReport(service, options = {}) {
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number(options.limit) || DEFAULT_LIMIT));
  const where = whereClause(options);
  // Fetch one extra row to know whether another page exists without a
  // separate COUNT query.
  const rows = await service.db.queryAll(`SELECT * FROM audit_logs ${where} ORDER BY id DESC LIMIT ${sqlValue(limit + 1)};`);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    filters: {
      entity_type: options.entityType ?? null,
      entity_id: options.entityId ?? null,
      actor_id: options.actorId ?? null,
      action: options.action ?? null,
      from: options.from ?? null,
      to: options.to ?? null
    },
    entries: page.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      action: row.action,
      actor_id: row.actor_id,
      correlation_id: row.correlation_id,
      before: row.before_json ? JSON.parse(row.before_json) : null,
      after: row.after_json ? JSON.parse(row.after_json) : null
    })),
    has_more: hasMore,
    next_before_id: hasMore ? page.at(-1).id : null
  };
}
