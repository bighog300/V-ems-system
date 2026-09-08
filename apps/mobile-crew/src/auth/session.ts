const SESSION_KEY = "vems.mobile.session";

export interface Session {
  apiBaseUrl: string;
  authToken: string;
  actorId: string;
  actorRole: string;
  // Optional so a session persisted before device identity existed still
  // loads: the deep-link/push registration path falls back to
  // getOrCreateDeviceId() when this is missing.
  deviceId?: string;
}

export interface SecureStoreLike {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

// expo-secure-store binds to a native module that only resolves inside the
// Expo/React Native runtime, so it's imported lazily here rather than at
// module scope — that keeps these session functions plain-Node-testable via
// an injected fake store without requiring a native binding at import time.
let defaultStorePromise: Promise<SecureStoreLike> | null = null;
function getDefaultStore(): Promise<SecureStoreLike> {
  if (!defaultStorePromise) {
    defaultStorePromise = import("expo-secure-store");
  }
  return defaultStorePromise;
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.apiBaseUrl === "string" &&
    typeof candidate.authToken === "string" &&
    typeof candidate.actorId === "string" &&
    typeof candidate.actorRole === "string"
  );
}

export async function loadSession(store?: SecureStoreLike): Promise<Session | null> {
  const activeStore = store ?? (await getDefaultStore());
  const raw = await activeStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session, store?: SecureStoreLike): Promise<void> {
  const activeStore = store ?? (await getDefaultStore());
  await activeStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession(store?: SecureStoreLike): Promise<void> {
  const activeStore = store ?? (await getDefaultStore());
  await activeStore.deleteItemAsync(SESSION_KEY);
}
