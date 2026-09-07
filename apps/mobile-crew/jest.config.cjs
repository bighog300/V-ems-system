/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/test/**/*.jest.test.tsx"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@noble/.*)"
  ],
  moduleNameMapper: {
    "^expo-secure-store$": "<rootDir>/test/__mocks__/expo-secure-store.ts",
    "^expo-local-authentication$": "<rootDir>/test/__mocks__/expo-local-authentication.ts",
    "^expo-sqlite$": "<rootDir>/test/__mocks__/expo-sqlite.ts",
    "^@react-native-community/netinfo$": "<rootDir>/test/__mocks__/@react-native-community/netinfo.ts"
  }
};
