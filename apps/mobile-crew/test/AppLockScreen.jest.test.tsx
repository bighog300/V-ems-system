import { render, waitFor } from "@testing-library/react-native";
import { jest, describe, it, expect, afterEach } from "@jest/globals";
import * as LocalAuthentication from "expo-local-authentication";

import AppLockScreen from "../src/screens/AppLockScreen.tsx";

describe("AppLockScreen", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("unlocks automatically when no biometric hardware is enrolled", async () => {
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValueOnce(false);
    const onUnlocked = jest.fn();

    await render(<AppLockScreen onUnlocked={onUnlocked} />);

    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1));
  });

  it("shows an error and stays locked when authentication fails", async () => {
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValueOnce(true);
    jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValueOnce(true);
    jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValueOnce({ success: false, error: "user_cancel" });
    const onUnlocked = jest.fn();

    const { getByTestId } = await render(<AppLockScreen onUnlocked={onUnlocked} />);

    await waitFor(() => expect(getByTestId("lock-error")).toBeTruthy());
    expect(onUnlocked).not.toHaveBeenCalled();
  });
});
