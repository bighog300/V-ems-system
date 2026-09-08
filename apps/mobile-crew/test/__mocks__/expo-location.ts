export const getForegroundPermissionsAsync = jest.fn(async () => ({ status: "undetermined" }));
export const requestForegroundPermissionsAsync = jest.fn(async () => ({ status: "undetermined" }));
export const getCurrentPositionAsync = jest.fn(async () => ({ coords: { latitude: 0, longitude: 0, accuracy: null } }));
