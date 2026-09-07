// Component tests exercise screen/navigation behavior, not the offline
// sync engine — this stub lets code that opens the offline database run
// without a real native SQLite binding, always reporting an empty store.
function createStubDatabase() {
  return {
    execAsync: jest.fn(async () => undefined),
    runAsync: jest.fn(async () => ({ changes: 0 })),
    getAllAsync: jest.fn(async () => []),
    getFirstAsync: jest.fn(async () => null)
  };
}

export const openDatabaseAsync = jest.fn(async () => createStubDatabase());
