/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/test/**/*.jest.test.tsx"],
  // CI runs jest workers in parallel under real resource contention, and the
  // default 5000ms budget has been observed to trip on an otherwise-passing
  // render under that load (not a hang) — give tests headroom without
  // masking a genuine one.
  testTimeout: 20000,
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@noble/.*)"
  ],
  moduleNameMapper: {
    "^expo-secure-store$": "<rootDir>/test/__mocks__/expo-secure-store.ts",
    "^expo-local-authentication$": "<rootDir>/test/__mocks__/expo-local-authentication.ts",
    "^expo-sqlite$": "<rootDir>/test/__mocks__/expo-sqlite.ts",
    "^@react-native-community/netinfo$": "<rootDir>/test/__mocks__/@react-native-community/netinfo.ts",
    "^react-native-svg$": "<rootDir>/test/__mocks__/react-native-svg.tsx",
    "^expo-image-picker$": "<rootDir>/test/__mocks__/expo-image-picker.ts",
    "^expo-document-picker$": "<rootDir>/test/__mocks__/expo-document-picker.ts",
    "^expo-file-system$": "<rootDir>/test/__mocks__/expo-file-system.ts",
    "^expo-crypto$": "<rootDir>/test/__mocks__/expo-crypto.ts",
    "^expo-location$": "<rootDir>/test/__mocks__/expo-location.ts",
    "^expo-camera$": "<rootDir>/test/__mocks__/expo-camera.tsx"
  }
};
