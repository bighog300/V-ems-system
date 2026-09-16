const BASE_UUID_SUFFIX = "-0000-1000-8000-00805f9b34fb";

/**
 * Normalizes a Bluetooth SIG-assigned UUID to its canonical lowercase
 * 128-bit form, so a driver's matches()/subscribe calls compare correctly
 * regardless of whether the platform reports a 16-bit short form ("180d"),
 * a 32-bit short form, or the full 128-bit UUID already.
 * See Bluetooth Core Spec Vol 3, Part B, 2.5.1 (16-bit UUID -> 128-bit).
 */
export function normalizeUuid(uuid: string): string {
  const trimmed = uuid.trim().toLowerCase();
  if (/^[0-9a-f]{4}$/.test(trimmed)) return `0000${trimmed}${BASE_UUID_SUFFIX}`;
  if (/^[0-9a-f]{8}$/.test(trimmed)) return `${trimmed}${BASE_UUID_SUFFIX}`;
  return trimmed;
}

export function uuidsMatch(a: string, b: string): boolean {
  return normalizeUuid(a) === normalizeUuid(b);
}
