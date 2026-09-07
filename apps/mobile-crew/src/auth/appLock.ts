export interface LocalAuthenticationModule {
  hasHardwareAsync(): Promise<boolean>;
  isEnrolledAsync(): Promise<boolean>;
  authenticateAsync(options?: { promptMessage?: string; disableDeviceFallback?: boolean }): Promise<{ success: boolean; error?: string }>;
}

// expo-local-authentication binds to a native module that only resolves
// inside the Expo/React Native runtime, so it's imported lazily here —
// same reasoning as session.ts's SecureStore import.
let modulePromise: Promise<LocalAuthenticationModule> | null = null;
function getModule(): Promise<LocalAuthenticationModule> {
  if (!modulePromise) {
    modulePromise = import("expo-local-authentication");
  }
  return modulePromise;
}

export interface AppLockAvailability {
  hasHardware: boolean;
  isEnrolled: boolean;
}

/**
 * Whether this device can actually enforce an app-lock prompt. A device
 * with no biometric/passcode hardware or nothing enrolled can't be locked,
 * so the app falls back to allowing access rather than blocking a crew
 * member out of a device with no way to unlock it.
 */
export async function getAppLockAvailability(authModule?: LocalAuthenticationModule): Promise<AppLockAvailability> {
  const module = authModule ?? (await getModule());
  const [hasHardware, isEnrolled] = await Promise.all([module.hasHardwareAsync(), module.isEnrolledAsync()]);
  return { hasHardware, isEnrolled };
}

export async function authenticateWithAppLock(authModule?: LocalAuthenticationModule): Promise<boolean> {
  const module = authModule ?? (await getModule());
  const availability = await getAppLockAvailability(module);
  if (!availability.hasHardware || !availability.isEnrolled) return true;

  const result = await module.authenticateAsync({ promptMessage: "Unlock V-EMS Crew", disableDeviceFallback: false });
  return result.success;
}
