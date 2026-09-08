export const getPermissionsAsync = jest.fn(async () => ({ status: "undetermined" }));
export const requestPermissionsAsync = jest.fn(async () => ({ status: "undetermined" }));
export const getExpoPushTokenAsync = jest.fn(async () => ({ data: "ExponentPushToken[test]" }));
export const setNotificationHandler = jest.fn();
export const addNotificationResponseReceivedListener = jest.fn(() => ({ remove: jest.fn() }));
export const getLastNotificationResponseAsync = jest.fn(async () => null);
