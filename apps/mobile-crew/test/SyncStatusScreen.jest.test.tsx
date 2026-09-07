import { NavigationContainer } from "@react-navigation/native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import * as ExpoSQLite from "expo-sqlite";

import SyncStatusScreen, { type SyncStatusScreenProps } from "../src/screens/SyncStatusScreen.tsx";
import { __resetOfflineDatabaseCacheForTests } from "../src/offline/db.ts";

function renderScreen(props: SyncStatusScreenProps) {
  return render(
    <NavigationContainer>
      <SyncStatusScreen {...props} />
    </NavigationContainer>
  );
}

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    entry_id: "entry-1",
    scope: "observation",
    patient_case_id: "case-1",
    method: "POST",
    path: "/api/patient-cases/case-1/observations",
    encrypted_payload: "nonce:ciphertext",
    status: "failed",
    attempt_count: 6,
    last_attempted_at: new Date().toISOString(),
    last_error: "Network request failed",
    server_resource_id: null,
    created_at: new Date().toISOString(),
    ...overrides
  };
}

function fakeDb(getAllAsyncImpl: () => Promise<unknown[]>) {
  return {
    execAsync: jest.fn(async () => undefined),
    runAsync: jest.fn(async () => ({ changes: 1 })),
    getAllAsync: jest.fn(getAllAsyncImpl),
    getFirstAsync: jest.fn(async () => null)
  };
}

describe("SyncStatusScreen", () => {
  // getOfflineDatabase() caches the resolved connection module-wide, so
  // each test needs the cache cleared before it can inject its own db.
  beforeEach(() => {
    __resetOfflineDatabaseCacheForTests();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    __resetOfflineDatabaseCacheForTests();
  });

  it("shows an empty state when nothing is queued", async () => {
    jest.mocked(ExpoSQLite.openDatabaseAsync).mockResolvedValueOnce(fakeDb(async () => []) as never);

    const { getByTestId } = await renderScreen({ sync: { syncing: false, lastResult: null, syncNow: jest.fn(async () => {}) }, onBack: jest.fn() });

    await waitFor(() => expect(getByTestId("sync-status-empty")).toBeTruthy());
  });

  it("lists a failed entry with its error and a Retry action, without ever rendering the encrypted payload", async () => {
    const row = makeRow();
    jest.mocked(ExpoSQLite.openDatabaseAsync).mockResolvedValueOnce(fakeDb(async () => [row]) as never);

    const { getByTestId, queryByText } = await renderScreen({
      sync: { syncing: false, lastResult: null, syncNow: jest.fn(async () => {}) },
      onBack: jest.fn()
    });

    await waitFor(() => expect(getByTestId("sync-entry-entry-1")).toBeTruthy());
    expect(getByTestId("sync-entry-error-entry-1").props.children).toBe("Network request failed");
    expect(getByTestId("retry-entry-1")).toBeTruthy();
    expect(queryByText("nonce:ciphertext")).toBeNull();
  });

  it("does not show a Retry action for a queued (not yet failed) entry", async () => {
    const row = makeRow({ status: "queued", attempt_count: 0, last_error: null, last_attempted_at: null });
    jest.mocked(ExpoSQLite.openDatabaseAsync).mockResolvedValueOnce(fakeDb(async () => [row]) as never);

    const { getByTestId, queryByTestId } = await renderScreen({
      sync: { syncing: false, lastResult: null, syncNow: jest.fn(async () => {}) },
      onBack: jest.fn()
    });

    await waitFor(() => expect(getByTestId("sync-entry-entry-1")).toBeTruthy());
    expect(queryByTestId("retry-entry-1")).toBeNull();
  });

  it("pressing Retry resets the entry and triggers a fresh sync pass", async () => {
    const row = makeRow();
    let call = 0;
    const db = fakeDb(async () => {
      call += 1;
      return call === 1 ? [row] : [];
    });
    jest.mocked(ExpoSQLite.openDatabaseAsync).mockResolvedValueOnce(db as never);
    const syncNow = jest.fn(async () => {});

    const { getByTestId } = await renderScreen({ sync: { syncing: false, lastResult: null, syncNow }, onBack: jest.fn() });

    await waitFor(() => expect(getByTestId("sync-entry-entry-1")).toBeTruthy());
    await fireEvent.press(getByTestId("retry-entry-1"));

    await waitFor(() => expect(syncNow).toHaveBeenCalledTimes(1));
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining("UPDATE outbox_entries"), expect.arrayContaining(["queued", 0, null, "entry-1"]));
  });

  it("pressing Back calls onBack", async () => {
    jest.mocked(ExpoSQLite.openDatabaseAsync).mockResolvedValueOnce(fakeDb(async () => []) as never);
    const onBack = jest.fn();

    const { getByTestId } = await renderScreen({ sync: { syncing: false, lastResult: null, syncNow: jest.fn(async () => {}) }, onBack });
    await waitFor(() => expect(getByTestId("sync-status-empty")).toBeTruthy());

    await fireEvent.press(getByTestId("back-from-sync-status"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
