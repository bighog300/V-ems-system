// Component tests render BarcodeScannerModal without a real camera bridge —
// CameraView stubs to a pressable View that fires onBarcodeScanned with a
// fixed fake code when tapped, simulating a completed scan.
import { Pressable } from "react-native";

export const useCameraPermissions = jest.fn(() => [
  { granted: true, canAskAgain: true },
  jest.fn(async () => ({ granted: true, canAskAgain: true })),
  jest.fn(async () => ({ granted: true, canAskAgain: true }))
]);

export function CameraView({ testID, onBarcodeScanned }: any) {
  return <Pressable testID={testID} onPress={() => onBarcodeScanned?.({ data: "fake-scanned-code", type: "qr" })} />;
}
