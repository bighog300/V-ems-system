// Component tests render SignaturePad without a real native SVG bridge —
// this stub renders a plain View standing in for <Svg> and exposes the same
// toDataURL(callback) shape the real library's ref provides, resolving to a
// fixed fake base64 string so capture() behavior is testable.
import { forwardRef, useImperativeHandle } from "react";
import { View } from "react-native";

export const Svg = forwardRef(function Svg({ children, testID, width, height }: any, ref: any) {
  useImperativeHandle(ref, () => ({
    toDataURL: (callback: (base64: string) => void) => callback("fake-signature-base64")
  }));
  return (
    <View testID={testID} style={{ width, height }}>
      {children}
    </View>
  );
});

export function Path() {
  return null;
}

export default Svg;
