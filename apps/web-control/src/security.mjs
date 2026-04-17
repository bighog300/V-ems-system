export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeClassToken(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return /^[a-z0-9_-]+$/i.test(normalized) ? normalized : fallback;
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "short"
});

export function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return "Unavailable";
  return dateTimeFormatter.format(date);
}
