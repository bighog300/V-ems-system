export type LocationPermissionStatus = "granted" | "denied" | "undetermined";

export interface LocationModule {
  getForegroundPermissionsAsync(): Promise<{ status: string }>;
  requestForegroundPermissionsAsync(): Promise<{ status: string }>;
  getCurrentPositionAsync(options?: { accuracy?: number }): Promise<{ coords: { latitude: number; longitude: number; accuracy: number | null } }>;
}

export interface LocationCoordsPayload {
  location_lat: number;
  location_lng: number;
  location_accuracy_m: number | null;
}

// expo-location binds to a native module that only resolves inside the
// Expo/RN runtime — lazily imported here for the same reason session.ts and
// appLock.ts do, and for the same reason both accept an injectable
// dependency for plain-Node testing.
let modulePromise: Promise<LocationModule> | null = null;
function getModule(): Promise<LocationModule> {
  if (!modulePromise) modulePromise = import("expo-location") as unknown as Promise<LocationModule>;
  return modulePromise;
}

function normalizeStatus(status: string): LocationPermissionStatus {
  return status === "granted" || status === "denied" ? status : "undetermined";
}

export async function getLocationPermissionStatus(locationModule?: LocationModule): Promise<LocationPermissionStatus> {
  try {
    const module = locationModule ?? (await getModule());
    const result = await module.getForegroundPermissionsAsync();
    return normalizeStatus(result.status);
  } catch {
    return "undetermined";
  }
}

/**
 * Requests foreground location permission. Only ever called from a
 * deliberate crew action (the "Enable location" affordance, shown alongside
 * its own rationale text) — never implicitly from a charting action, so the
 * OS permission dialog is never a surprise mid-workflow.
 */
export async function requestLocationPermission(locationModule?: LocationModule): Promise<LocationPermissionStatus> {
  try {
    const module = locationModule ?? (await getModule());
    const result = await module.requestForegroundPermissionsAsync();
    return normalizeStatus(result.status);
  } catch {
    return "undetermined";
  }
}

/**
 * Best-effort location capture for a clinical event (encounter start,
 * disposition). Only ever reads the CURRENT permission state — never
 * itself triggers the OS prompt — so calling this from a charting action
 * can never interrupt or delay it. Returns null on anything but a clean,
 * already-granted fix: denied/undetermined permission, a hardware/timeout
 * error, whatever — charting must never wait on or fail because of this.
 */
export async function captureLocation(locationModule?: LocationModule): Promise<LocationCoordsPayload | null> {
  try {
    const module = locationModule ?? (await getModule());
    const permission = await module.getForegroundPermissionsAsync();
    if (normalizeStatus(permission.status) !== "granted") return null;
    const position = await module.getCurrentPositionAsync({ accuracy: 3 });
    return {
      location_lat: position.coords.latitude,
      location_lng: position.coords.longitude,
      location_accuracy_m: position.coords.accuracy ?? null
    };
  } catch {
    return null;
  }
}
