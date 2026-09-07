import type { OutboxStatus } from "./db.ts";

export interface OutboxSummary {
  queued: number;
  sending: number;
  retrying: number;
  conflict: number;
  failed: number;
  acknowledged: number;
}

const EMPTY_SUMMARY: OutboxSummary = { queued: 0, sending: 0, retrying: 0, conflict: 0, failed: 0, acknowledged: 0 };

export function summarizeOutboxEntries(entries: Array<{ status: OutboxStatus }>): OutboxSummary {
  const summary = { ...EMPTY_SUMMARY };
  for (const entry of entries) summary[entry.status] += 1;
  return summary;
}

/** Whether anything in the outbox needs a crew member to notice and act — a conflict or a give-up-after-retries failure. */
export function needsAttention(summary: OutboxSummary): boolean {
  return summary.conflict > 0 || summary.failed > 0;
}

const SCOPE_LABELS: Record<string, string> = {
  assessment: "Assessment",
  observation: "Vitals",
  medication: "Medication",
  procedure: "Procedure",
  disposition: "Disposition",
  demographics: "Demographics"
};

export function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope;
}

const STATUS_LABELS: Record<OutboxStatus, string> = {
  queued: "Waiting to sync",
  sending: "Syncing…",
  retrying: "Retrying",
  acknowledged: "Synced",
  conflict: "Conflict",
  failed: "Failed"
};

export function statusLabel(status: OutboxStatus): string {
  return STATUS_LABELS[status] ?? status;
}
