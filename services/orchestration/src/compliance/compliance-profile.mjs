// Stage 13 milestone 13a: the ComplianceProfile framework itself --
// definition shape, required-field validation, and terminology lookup.
// Deliberately decoupled from any one jurisdiction's actual minimum
// dataset (see docs/STAGE13_COMPLIANCE_REPORTING_PLAN.md's "Jurisdiction"
// design decision): a profile is data this module operates on generically,
// never something this module hard-codes rules for.
//
// Not wired into ePCR finalization yet (that's milestone 13c) -- this
// module validates a plain snapshot-shaped object (the same shape
// epcr-finalization.mjs's snapshot() already produces), independent of
// how/when that snapshot gets built or who calls this.

function getByPath(record, path) {
  return path.split(".").reduce((value, segment) => (value === null || value === undefined ? undefined : value[segment]), record);
}

function isPresent(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * A ComplianceProfile:
 * {
 *   id: string,              // stable identifier, e.g. "reference-nemsis-v3"
 *   name: string,
 *   version: string,         // profile content version, independent of the export-format version (13h)
 *   requiredFields: [{
 *     id: string,             // stable identifier for this requirement
 *     path: string,           // dot-path into the record being validated
 *     label: string,          // human-readable description
 *     appliesWhen?: (record) => boolean  // defaults to always-applies
 *   }],
 *   codeLists: {
 *     [category: string]: [{ code: string, label: string, aliases?: string[] }]
 *   }
 * }
 */

export function validateAgainstProfile(profile, record) {
  const evaluated = [];
  const missing = [];

  for (const field of profile.requiredFields) {
    const applies = field.appliesWhen ? Boolean(field.appliesWhen(record)) : true;
    if (!applies) {
      evaluated.push({ id: field.id, path: field.path, label: field.label, applies: false, satisfied: null });
      continue;
    }
    const value = getByPath(record, field.path);
    const satisfied = isPresent(value);
    evaluated.push({ id: field.id, path: field.path, label: field.label, applies: true, satisfied });
    if (!satisfied) missing.push({ id: field.id, path: field.path, label: field.label });
  }

  return {
    profile_id: profile.id,
    profile_version: profile.version,
    ready: missing.length === 0,
    missing,
    evaluated
  };
}

function normalizeForMatch(value) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Resolves a raw free-text value (e.g. a charted medication_name) to a
 * profile-supplied canonical code for the given category, by exact
 * case-insensitive match against the code's label or any alias. Returns
 * null on no match -- callers (13b) decide what an unmapped value means
 * for their own field, this function only ever reports match/no-match.
 */
export function resolveCode(profile, category, rawValue) {
  const codeList = profile.codeLists?.[category];
  if (!codeList || !isPresent(rawValue)) return null;
  const normalized = normalizeForMatch(rawValue);
  return codeList.find((entry) => {
    if (normalizeForMatch(entry.label) === normalized) return true;
    return (entry.aliases ?? []).some((alias) => normalizeForMatch(alias) === normalized);
  }) ?? null;
}

export function listCodes(profile, category) {
  return profile.codeLists?.[category] ?? [];
}
