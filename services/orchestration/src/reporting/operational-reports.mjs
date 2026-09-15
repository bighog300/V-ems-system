// Stage 13 milestone 13e: the first cross-case reporting endpoints --
// every existing GET endpoint before this milestone is scoped to one
// entity or one patient case (or, for /api/support/*, to system/
// operational health). These aggregate across incidents/stock usage/QA
// flags.
//
// All three accept an optional { from, to } ISO-8601 date range (either
// or both may be omitted, meaning unbounded on that side) and query at
// the SQL level rather than pulling every row ever recorded into JS --
// deliberately, since 12j's capacity/load-testing work already flagged
// listIncidentsForBoard()'s unbounded-scan pattern as a real scaling
// risk, and there's no reason to repeat it here when a bounded WHERE
// clause is just as easy to write.

import { sqlValue } from "../db.mjs";
import { addDecimal } from "../repositories/vehicle-stock-repository.mjs";

function dateRangeClause(column, from, to) {
  const clauses = [];
  if (from) clauses.push(`${column} >= ${sqlValue(from)}`);
  if (to) clauses.push(`${column} <= ${sqlValue(to)}`);
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key] ?? "unknown";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function percentile(sortedMs, p) {
  if (sortedMs.length === 0) return null;
  const rank = Math.ceil((p / 100) * sortedMs.length) - 1;
  return sortedMs[Math.max(0, Math.min(sortedMs.length - 1, rank))];
}

/**
 * Incident volume and dispatch-time rollup.
 *
 * "Dispatch time" here means incident-created to first-assignment-created,
 * the only two timestamps the schema actually carries for this -- there
 * is no per-status-transition history table (only each assignment's own
 * created_at/updated_at), so on-scene time, transport time, etc. aren't
 * computable and aren't reported here rather than being approximated from
 * a field that doesn't actually mean that.
 */
export async function getIncidentVolumeReport(service, { from, to } = {}) {
  const incidents = await service.db.queryAll(`SELECT incident_id, status, category, priority, created_at FROM incidents ${dateRangeClause("created_at", from, to)};`);
  const firstAssignmentRows = await service.db.queryAll("SELECT incident_id, MIN(created_at) AS first_assigned_at FROM assignments GROUP BY incident_id;");
  const firstAssignedAtByIncident = new Map(firstAssignmentRows.map((row) => [row.incident_id, row.first_assigned_at]));

  const dispatchTimesMs = incidents
    .map((incident) => {
      const firstAssignedAt = firstAssignedAtByIncident.get(incident.incident_id);
      if (!firstAssignedAt) return null;
      const deltaMs = new Date(firstAssignedAt).getTime() - new Date(incident.created_at).getTime();
      return Number.isFinite(deltaMs) && deltaMs >= 0 ? deltaMs : null;
    })
    .filter((value) => value !== null)
    .sort((a, b) => a - b);

  return {
    range: { from: from ?? null, to: to ?? null },
    total_incidents: incidents.length,
    by_status: countBy(incidents, "status"),
    by_category: countBy(incidents, "category"),
    by_priority: countBy(incidents, "priority"),
    dispatch_time_ms: {
      sample_count: dispatchTimesMs.length,
      unassigned_count: incidents.length - dispatchTimesMs.length,
      min: dispatchTimesMs[0] ?? null,
      max: dispatchTimesMs.at(-1) ?? null,
      avg: dispatchTimesMs.length ? Math.round(dispatchTimesMs.reduce((sum, ms) => sum + ms, 0) / dispatchTimesMs.length) : null,
      p50: percentile(dispatchTimesMs, 50),
      p95: percentile(dispatchTimesMs, 95)
    }
  };
}

/**
 * Medication/stock usage rollup, drawing on Stage 5's Vtiger stock-usage
 * linkage (the stock_usage table this reads is the same table
 * recordClinicalStockUsage() writes to whenever a medication/procedure
 * consumes tracked stock).
 */
export async function getStockUsageReport(service, { from, to } = {}) {
  const usageRows = await service.db.queryAll(`SELECT stock_usage.*, stock_items.name AS stock_item_name, stock_items.unit_of_measure FROM stock_usage LEFT JOIN stock_items ON stock_items.stock_item_id = stock_usage.stock_item_id ${dateRangeClause("stock_usage.performed_at", from, to)};`);

  const byItem = new Map();
  for (const row of usageRows) {
    const key = row.stock_item_id;
    const existing = byItem.get(key) ?? {
      stock_item_id: key,
      stock_item_name: row.stock_item_name ?? null,
      unit_of_measure: row.unit_of_measure ?? null,
      usage_count: 0,
      total_quantity_used: "0",
      discrepancy_count: 0
    };
    existing.usage_count += 1;
    existing.total_quantity_used = addDecimal(existing.total_quantity_used, row.quantity_used);
    if (row.discrepancy_status) existing.discrepancy_count += 1;
    byItem.set(key, existing);
  }

  const discrepancies = usageRows.filter((row) => row.discrepancy_status);

  return {
    range: { from: from ?? null, to: to ?? null },
    total_usage_events: usageRows.length,
    total_discrepancies: discrepancies.length,
    discrepancy_status_counts: countBy(discrepancies, "discrepancy_status"),
    by_stock_item: [...byItem.values()].sort((a, b) => b.usage_count - a.usage_count)
  };
}

/**
 * QA-flag dashboard, aggregated across every patient case -- the
 * per-case listEpcrQaFlags() already exists (Stage 8); this is the
 * cross-case view.
 */
export async function getQaFlagReport(service, { from, to } = {}) {
  const flags = await service.db.queryAll(`SELECT * FROM epcr_qa_flags ${dateRangeClause("raised_at", from, to)};`);
  const unresolved = flags.filter((flag) => !flag.resolved_at);
  const severityRank = { critical: 0, high: 1, warning: 2, low: 3 };
  const unresolvedSorted = [...unresolved].sort((a, b) => {
    const rankDiff = (severityRank[a.severity] ?? 99) - (severityRank[b.severity] ?? 99);
    return rankDiff !== 0 ? rankDiff : a.raised_at.localeCompare(b.raised_at);
  });

  return {
    range: { from: from ?? null, to: to ?? null },
    total_flags: flags.length,
    resolved_count: flags.length - unresolved.length,
    unresolved_count: unresolved.length,
    by_flag_type: countBy(flags, "flag_type"),
    by_severity: countBy(flags, "severity"),
    unresolved_flags: unresolvedSorted.slice(0, 50).map((flag) => ({
      flag_id: flag.flag_id,
      patient_case_id: flag.patient_case_id,
      flag_type: flag.flag_type,
      severity: flag.severity,
      source: flag.source,
      raised_at: flag.raised_at,
      resolution_note: flag.resolution_note
    }))
  };
}
