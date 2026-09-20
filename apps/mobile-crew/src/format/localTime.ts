/**
 * A stored timestamp is an ISO-8601 UTC instant, which is right for the record and wrong for a crew member reading a
 * history list. This shows it in the device's own time zone with the zone named, so "10:05 BST" cannot be misread as UTC.
 * Anything that is not a valid instant is returned unchanged rather than hidden.
 */
export function formatLocalDateTime(iso: string | null | undefined, options: { timeZone?: string; locale?: string } = {}): string {
  if (!iso) return "";
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(options.locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
      timeZone: options.timeZone
    }).format(instant);
  } catch {
    return iso;
  }
}
