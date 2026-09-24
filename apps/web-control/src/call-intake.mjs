const CALL_SOURCES = new Set(["phone", "radio", "walk_in", "transfer", "other"]);
const CATEGORIES = new Set(["medical_emergency", "trauma", "cardiac", "respiratory", "maternity", "psychiatric", "standby", "other"]);
const PRIORITIES = new Set(["critical", "high", "medium", "low"]);

export function buildCallIntakePayload(formData) {
  const source = String(formData.get("call_source") ?? "");
  const category = String(formData.get("category") ?? "");
  const priority = String(formData.get("priority") ?? "");
  const receivedAt = String(formData.get("received_at") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const countText = String(formData.get("patient_count") ?? "").trim();
  const errors = [];
  if (!CALL_SOURCES.has(source)) errors.push("Select a call source.");
  if (!CATEGORIES.has(category)) errors.push("Select an incident category.");
  if (!PRIORITIES.has(priority)) errors.push("Select a priority.");
  if (!receivedAt || Number.isNaN(Date.parse(receivedAt))) errors.push("Enter a valid received time.");
  if (!description) errors.push("Enter the incident description.");
  if (!address) errors.push("Enter the incident address.");
  if (!/^(0|[1-9]\d*)$/.test(countText) || !Number.isSafeInteger(Number(countText))) errors.push("Patient count must be a non-negative whole number.");
  if (errors.length) return { payload: null, errors };
  return {
    payload: {
      call: { call_source: source, received_at: new Date(receivedAt).toISOString() },
      incident: { category, priority, description, address, patient_count: Number(countText) }
    },
    errors: []
  };
}

export function localDateTimeValue(date = new Date()) {
  const local = new Date(date.valueOf() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
