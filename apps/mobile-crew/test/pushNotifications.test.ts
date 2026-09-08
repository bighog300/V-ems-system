import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractAssignmentDeepLink,
  getLaunchDeepLink,
  getPushToken,
  subscribeToNotificationTaps,
  type NotificationsModule
} from "../src/notifications/pushNotifications.ts";

function fakeModule(overrides: Partial<NotificationsModule> = {}): NotificationsModule {
  return {
    getPermissionsAsync: async () => ({ status: "granted" }),
    requestPermissionsAsync: async () => ({ status: "granted" }),
    getExpoPushTokenAsync: async () => ({ data: "ExponentPushToken[fake]" }),
    setNotificationHandler: () => {},
    addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
    getLastNotificationResponseAsync: async () => null,
    ...overrides
  };
}

function assignmentNotification(data: Record<string, unknown>) {
  return { notification: { request: { content: { data } } } };
}

test("getPushToken returns a token when permission is already granted", async () => {
  const token = await getPushToken({ notificationsModule: fakeModule() });
  assert.equal(token, "ExponentPushToken[fake]");
});

test("getPushToken requests permission when undetermined, then returns a token", async () => {
  let requested = false;
  const token = await getPushToken({
    notificationsModule: fakeModule({
      getPermissionsAsync: async () => ({ status: "undetermined" }),
      requestPermissionsAsync: async () => {
        requested = true;
        return { status: "granted" };
      }
    })
  });
  assert.equal(requested, true);
  assert.equal(token, "ExponentPushToken[fake]");
});

test("getPushToken returns null without requesting a token when permission is denied", async () => {
  const token = await getPushToken({
    notificationsModule: fakeModule({
      getPermissionsAsync: async () => ({ status: "denied" }),
      getExpoPushTokenAsync: async () => {
        throw new Error("should not fetch a token without permission");
      }
    })
  });
  assert.equal(token, null);
});

test("getPushToken never throws — returns null when the token fetch fails", async () => {
  const token = await getPushToken({
    notificationsModule: fakeModule({
      getExpoPushTokenAsync: async () => {
        throw new Error("network error");
      }
    })
  });
  assert.equal(token, null);
});

test("extractAssignmentDeepLink parses a well-formed assignment notification", () => {
  const deepLink = extractAssignmentDeepLink(assignmentNotification({ screen: "IncidentDetail", incident_id: "INC-000001", assignment_id: "ASN-000001" }));
  assert.deepEqual(deepLink, { screen: "IncidentDetail", incidentId: "INC-000001", assignmentId: "ASN-000001" });
});

test("extractAssignmentDeepLink returns null for a notification with no data", () => {
  assert.equal(extractAssignmentDeepLink({ notification: { request: { content: {} } } }), null);
});

test("extractAssignmentDeepLink returns null for null/undefined input", () => {
  assert.equal(extractAssignmentDeepLink(null), null);
  assert.equal(extractAssignmentDeepLink(undefined), null);
});

test("extractAssignmentDeepLink returns null for an unrecognized screen", () => {
  assert.equal(extractAssignmentDeepLink(assignmentNotification({ screen: "SomethingElse", incident_id: "INC-000001", assignment_id: "ASN-000001" })), null);
});

test("extractAssignmentDeepLink returns null when a required field is missing", () => {
  assert.equal(extractAssignmentDeepLink(assignmentNotification({ screen: "IncidentDetail", incident_id: "INC-000001" })), null);
});

test("getLaunchDeepLink returns the parsed deep link that caused a cold start", async () => {
  const deepLink = await getLaunchDeepLink({
    notificationsModule: fakeModule({
      getLastNotificationResponseAsync: async () => assignmentNotification({ screen: "IncidentDetail", incident_id: "INC-000002", assignment_id: "ASN-000002" })
    })
  });
  assert.deepEqual(deepLink, { screen: "IncidentDetail", incidentId: "INC-000002", assignmentId: "ASN-000002" });
});

test("getLaunchDeepLink returns null when there was no launching notification", async () => {
  const deepLink = await getLaunchDeepLink({ notificationsModule: fakeModule() });
  assert.equal(deepLink, null);
});

test("getLaunchDeepLink never throws — returns null on failure", async () => {
  const deepLink = await getLaunchDeepLink({
    notificationsModule: fakeModule({
      getLastNotificationResponseAsync: async () => {
        throw new Error("boom");
      }
    })
  });
  assert.equal(deepLink, null);
});

test("subscribeToNotificationTaps invokes the callback only for a recognized deep link, and unsubscribes cleanly", async () => {
  let capturedListener: ((response: { notification?: { request?: { content?: { data?: unknown } } } }) => void) | undefined;
  let removed = false;
  const seen: unknown[] = [];

  const unsubscribe = await subscribeToNotificationTaps((deepLink) => seen.push(deepLink), {
    notificationsModule: fakeModule({
      addNotificationResponseReceivedListener: (listener) => {
        capturedListener = listener;
        return {
          remove: () => {
            removed = true;
          }
        };
      }
    })
  });

  capturedListener?.(assignmentNotification({ screen: "IncidentDetail", incident_id: "INC-000003", assignment_id: "ASN-000003" }));
  assert.deepEqual(seen, [{ screen: "IncidentDetail", incidentId: "INC-000003", assignmentId: "ASN-000003" }]);

  capturedListener?.({ notification: { request: { content: {} } } });
  assert.equal(seen.length, 1);

  unsubscribe();
  assert.equal(removed, true);
});
