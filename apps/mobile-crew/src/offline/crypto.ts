import { gcm } from "@noble/ciphers/aes.js";
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes } from "@noble/ciphers/utils.js";

const KEY_STORAGE_KEY = "vems.mobile.offline_encryption_key";
const KEY_BYTE_LENGTH = 32; // AES-256
const NONCE_BYTE_LENGTH = 12; // standard GCM nonce size

export interface OfflineCryptoModule {
  getRandomBytesAsync(byteCount: number): Promise<Uint8Array>;
}

export interface SecureKeyStoreLike {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

// expo-crypto and expo-secure-store are native modules that only resolve
// inside the Expo/RN runtime — lazily imported here for the same reason
// session.ts and appLock.ts do, and for the same reason both accept an
// injectable dependency for plain-Node testing.
let cryptoModulePromise: Promise<OfflineCryptoModule> | null = null;
function getCryptoModule(): Promise<OfflineCryptoModule> {
  if (!cryptoModulePromise) cryptoModulePromise = import("expo-crypto");
  return cryptoModulePromise;
}

let secureStorePromise: Promise<SecureKeyStoreLike> | null = null;
function getSecureStore(): Promise<SecureKeyStoreLike> {
  if (!secureStorePromise) secureStorePromise = import("expo-secure-store");
  return secureStorePromise;
}

/**
 * Loads the device's offline-database encryption key from SecureStore,
 * generating and persisting a new one on first launch. The key never
 * leaves SecureStore in plaintext form except transiently in memory while
 * encrypting/decrypting an outbox entry or cached read.
 */
export async function getOrCreateEncryptionKey(deps: { secureStore?: SecureKeyStoreLike; cryptoModule?: OfflineCryptoModule } = {}): Promise<Uint8Array> {
  const secureStore = deps.secureStore ?? (await getSecureStore());
  const existing = await secureStore.getItemAsync(KEY_STORAGE_KEY);
  if (existing) return hexToBytes(existing);

  const cryptoModule = deps.cryptoModule ?? (await getCryptoModule());
  const key = await cryptoModule.getRandomBytesAsync(KEY_BYTE_LENGTH);
  await secureStore.setItemAsync(KEY_STORAGE_KEY, bytesToHex(key));
  return key;
}

/** Encrypts a JSON-serializable value, returning an opaque `nonce:ciphertext` hex string. */
export async function encryptJson(value: unknown, key: Uint8Array, deps: { cryptoModule?: OfflineCryptoModule } = {}): Promise<string> {
  const cryptoModule = deps.cryptoModule ?? (await getCryptoModule());
  const nonce = await cryptoModule.getRandomBytesAsync(NONCE_BYTE_LENGTH);
  const plaintext = utf8ToBytes(JSON.stringify(value));
  const ciphertext = gcm(key, nonce).encrypt(plaintext);
  return `${bytesToHex(nonce)}:${bytesToHex(ciphertext)}`;
}

/** Decrypts a value produced by {@link encryptJson}. Throws if the key is wrong or the blob was tampered with. */
export function decryptJson<T>(encoded: string, key: Uint8Array): T {
  const [nonceHex, ciphertextHex] = encoded.split(":");
  if (!nonceHex || !ciphertextHex) throw new Error("Malformed encrypted payload");
  const nonce = hexToBytes(nonceHex);
  const ciphertext = hexToBytes(ciphertextHex);
  const plaintext = gcm(key, nonce).decrypt(ciphertext);
  return JSON.parse(bytesToUtf8(plaintext));
}
