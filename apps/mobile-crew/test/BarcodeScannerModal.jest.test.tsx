import { fireEvent, render } from "@testing-library/react-native";
import { jest, describe, it, expect, afterEach } from "@jest/globals";
import * as ExpoCamera from "expo-camera";

import BarcodeScannerModal from "../src/scanning/BarcodeScannerModal.tsx";

describe("BarcodeScannerModal", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows the camera view and reports a scanned code once", async () => {
    const onScanned = jest.fn();
    const onClose = jest.fn();

    const { getByTestId } = await render(<BarcodeScannerModal visible onScanned={onScanned} onClose={onClose} />);

    await fireEvent.press(getByTestId("barcode-camera-view"));

    expect(onScanned).toHaveBeenCalledTimes(1);
    expect(onScanned).toHaveBeenCalledWith("fake-scanned-code");
  });

  it("shows a grant-access prompt when permission is denied", async () => {
    jest
      .mocked(ExpoCamera.useCameraPermissions)
      .mockReturnValueOnce([{ granted: false, canAskAgain: true } as never, jest.fn() as never, jest.fn() as never]);

    const { getByTestId } = await render(<BarcodeScannerModal visible onScanned={jest.fn()} onClose={jest.fn()} />);

    expect(getByTestId("grant-camera-access")).toBeTruthy();
  });

  it("tapping Cancel closes the scanner without reporting a code", async () => {
    const onScanned = jest.fn();
    const onClose = jest.fn();

    const { getByTestId } = await render(<BarcodeScannerModal visible onScanned={onScanned} onClose={onClose} />);

    await fireEvent.press(getByTestId("cancel-scan"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onScanned).not.toHaveBeenCalled();
  });
});
