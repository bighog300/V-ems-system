const DEVICE_ID_STORAGE_KEY = "vems.mobile.device_id";

export interface DeviceIdentityCryptoModule {
  randomUUID(): string;
}

export interface SecureKeyStoreLike {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

// expo-crypto and expo-secure-store are native modules that only resolve
// inside the Expo/RN runtime — lazily imported here for the same reason
// every other native dependency in this app is, and for the same reason
// this accepts injectable dependencies for plain-Node testing.
let cryptoModulePromise: Promise<DeviceIdentityCryptoModule> | null = null;
function getCryptoModule(): Promise<DeviceIdentityCryptoModule> {
  if (!cryptoModulePromise) cryptoModulePromise = import("expo-crypto");
  return cryptoModulePromise;
}

let secureStorePromise: Promise<SecureKeyStoreLike> | null = null;
function getSecureStore(): Promise<SecureKeyStoreLike> {
  if (!secureStorePromise) secureStorePromise = import("expo-secure-store");
  return secureStorePromise;
}

/**
 * A stable identifier for this app install, generated once and persisted in
 * SecureStore — the same getOrCreate pattern as the offline-database
 * encryption key (offline/crypto.ts), reused here rather than depending on
 * an OS-level ID (iOS's identifier-for-vendor can return null; there's no
 * single cross-platform equivalent). Attached to the session and to push
 * token registration so Stage 12's device/session-revocation work has a
 * stable handle to revoke against, without building revocation itself yet.
 */
export async function getOrCreateDeviceId(deps: { secureStore?: SecureKeyStoreLike; cryptoModule?: DeviceIdentityCryptoModule } = {}): Promise<string> {
  const secureStore = deps.secureStore ?? (await getSecureStore());
  const existing = await secureStore.getItemAsync(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;

  const cryptoModule = deps.cryptoModule ?? (await getCryptoModule());
  const deviceId = cryptoModule.randomUUID();
  await secureStore.setItemAsync(DEVICE_ID_STORAGE_KEY, deviceId);
  return deviceId;
}
