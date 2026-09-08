export type PushPermissionStatus = "granted" | "denied" | "undetermined";

export interface NotificationResponseLike {
  notification?: { request?: { content?: { data?: unknown } } };
}

export interface NotificationsModule {
  getPermissionsAsync(): Promise<{ status: string }>;
  requestPermissionsAsync(): Promise<{ status: string }>;
  getExpoPushTokenAsync(options?: { projectId?: string }): Promise<{ data: string }>;
  setNotificationHandler(handler: unknown): void;
  addNotificationResponseReceivedListener(callback: (response: NotificationResponseLike) => void): { remove(): void };
  getLastNotificationResponseAsync(): Promise<NotificationResponseLike | null>;
}

// expo-notifications binds to a native module that only resolves inside the
// Expo/RN runtime — lazily imported here for the same reason every other
// native dependency in this app is, and for the same reason it accepts an
// injectable dependency for plain-Node testing.
let modulePromise: Promise<NotificationsModule> | null = null;
function getModule(): Promise<NotificationsModule> {
  if (!modulePromise) modulePromise = import("expo-notifications") as unknown as Promise<NotificationsModule>;
  return modulePromise;
}

function normalizeStatus(status: string): PushPermissionStatus {
  return status === "granted" || status === "denied" ? status : "undetermined";
}

/**
 * Shows a foreground notification (banner + sound) instead of the OS
 * default of silently delivering it while the app is open — a crew member
 * looking at the app when a new assignment lands should still see it.
 */
export async function configureForegroundNotificationHandler(deps: { notificationsModule?: NotificationsModule } = {}): Promise<void> {
  const notifications = deps.notificationsModule ?? (await getModule());
  notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false })
  });
}

/**
 * Requests notification permission (only if not already determined) and
 * returns an Expo push token, or null on denial/failure. Never throws:
 * push registration is best-effort and must never block sign-in.
 */
export async function getPushToken(deps: { notificationsModule?: NotificationsModule; projectId?: string } = {}): Promise<string | null> {
  try {
    const notifications = deps.notificationsModule ?? (await getModule());
    let permission = await notifications.getPermissionsAsync();
    if (normalizeStatus(permission.status) === "undetermined") {
      permission = await notifications.requestPermissionsAsync();
    }
    if (normalizeStatus(permission.status) !== "granted") return null;
    const token = await notifications.getExpoPushTokenAsync(deps.projectId ? { projectId: deps.projectId } : undefined);
    return token.data;
  } catch {
    return null;
  }
}

export interface AssignmentDeepLink {
  screen: "IncidentDetail";
  incidentId: string;
  assignmentId: string;
}

/** Pure parse of a notification's data payload into a typed deep link, or null if it isn't one we recognize. */
export function extractAssignmentDeepLink(response: NotificationResponseLike | null | undefined): AssignmentDeepLink | null {
  const data = response?.notification?.request?.content?.data;
  if (!data || typeof data !== "object") return null;
  const { screen, incident_id, assignment_id } = data as Record<string, unknown>;
  if (screen !== "IncidentDetail" || typeof incident_id !== "string" || typeof assignment_id !== "string") return null;
  return { screen: "IncidentDetail", incidentId: incident_id, assignmentId: assignment_id };
}

/** The deep link that caused a cold start (app launched by tapping a notification), or null otherwise. */
export async function getLaunchDeepLink(deps: { notificationsModule?: NotificationsModule } = {}): Promise<AssignmentDeepLink | null> {
  try {
    const notifications = deps.notificationsModule ?? (await getModule());
    const response = await notifications.getLastNotificationResponseAsync();
    return extractAssignmentDeepLink(response);
  } catch {
    return null;
  }
}

/** Subscribes to notification taps while the app is running (foreground or backgrounded, not killed). Returns an unsubscribe function. */
export async function subscribeToNotificationTaps(
  onDeepLink: (deepLink: AssignmentDeepLink) => void,
  deps: { notificationsModule?: NotificationsModule } = {}
): Promise<() => void> {
  const notifications = deps.notificationsModule ?? (await getModule());
  const subscription = notifications.addNotificationResponseReceivedListener((response) => {
    const deepLink = extractAssignmentDeepLink(response);
    if (deepLink) onDeepLink(deepLink);
  });
  return () => subscription.remove();
}
