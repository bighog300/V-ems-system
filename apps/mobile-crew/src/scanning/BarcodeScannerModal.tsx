import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { TOUCH_TARGET_MIN } from "../theme/a11y.ts";

export interface BarcodeScannerModalProps {
  visible: boolean;
  onScanned: (code: string) => void;
  onClose: () => void;
}

/**
 * A scan pre-fills a text field with the scanned code rather than resolving
 * it to a catalog record — the Vtiger-backed stock-item schema has no
 * barcode field yet (Stage 11 design decision). Camera permission is
 * requested at the point of use, same as photo capture in 11d: opening the
 * scanner already states the intent the OS prompt is asking about.
 */
export default function BarcodeScannerModal({ visible, onScanned, onClose }: BarcodeScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const hasScannedRef = useRef(false);

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (hasScannedRef.current) return;
    hasScannedRef.current = true;
    onScanned(result.data);
  }

  useEffect(() => {
    if (!visible) return;
    hasScannedRef.current = false;
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} testID="barcode-scanner-modal">
      <View style={styles.container}>
        {!permission ? (
          <ActivityIndicator testID="barcode-permission-loading" />
        ) : permission.granted ? (
          <CameraView
            style={styles.camera}
            testID="barcode-camera-view"
            barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "code39", "ean13", "ean8", "upc_a", "upc_e"] }}
            onBarcodeScanned={handleBarcodeScanned}
          />
        ) : (
          <View style={styles.permissionNotice}>
            <Text style={styles.permissionText}>V-EMS needs camera access to scan a barcode or QR code.</Text>
            <Pressable
              style={styles.permissionButton}
              onPress={() => requestPermission()}
              accessibilityRole="button"
              accessibilityLabel="Grant camera access"
              testID="grant-camera-access"
            >
              <Text style={styles.permissionButtonText}>Grant camera access</Text>
            </Pressable>
          </View>
        )}
        <Pressable style={styles.cancelButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel scan" testID="cancel-scan">
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "stretch"
  },
  camera: {
    flex: 1
  },
  permissionNotice: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24
  },
  permissionText: {
    color: "#fff",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 16
  },
  permissionButton: {
    minHeight: TOUCH_TARGET_MIN,
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a4fd6",
    borderRadius: 8
  },
  permissionButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600"
  },
  cancelButton: {
    minHeight: TOUCH_TARGET_MIN,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12
  },
  cancelButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600"
  }
});
