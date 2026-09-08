import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View, type GestureResponderEvent } from "react-native";
import Svg, { Path } from "react-native-svg";

import { TOUCH_TARGET_MIN } from "../theme/a11y.ts";

export interface SignaturePadHandle {
  /** Renders the drawing as a PNG data URI, or null if nothing has been drawn yet. */
  capture(): Promise<string | null>;
  clear(): void;
}

export interface SignaturePadProps {
  width?: number;
  height?: number;
  testID?: string;
}

interface Point {
  x: number;
  y: number;
}

// A quadratic-ish polyline is legible enough for a signature at this scale
// and far cheaper than smoothing/curve-fitting every point on every move.
function pointsToPath(points: Point[]): string {
  if (points.length === 0) return "";
  return points.reduce((d, point, index) => `${d}${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)} `, "");
}

/**
 * A drawn-signature capture surface: raw touch-responder handlers record
 * touch points, rendered live as an SVG path. Uses the low-level responder
 * props directly rather than `PanResponder.create` — this component only
 * ever needs a single active touch's location, not `PanResponder`'s
 * multi-touch gesture-state bookkeeping, and the raw handlers are simpler to
 * test (no synthetic `touchHistory` to fabricate). No native dependency
 * beyond `react-native-svg` itself (already Expo-managed-workflow
 * compatible, unlike a signature-canvas library that would need its own
 * native config) — see Stage 11 milestone 11a's design decision in
 * docs/STAGE11_FIELD_UX_PLAN.md.
 */
const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
  { width = 320, height = 160, testID },
  ref
) {
  const svgRef = useRef<Svg>(null);
  // Strokes are held in a ref, not just state: capture()/clear() are called
  // imperatively from a caller (EpcrScreen's handleSign) that shouldn't have
  // to worry about whether React has finished committing the render triggered
  // by the touch that just ended — the ref is always current, state is only
  // for what's on screen.
  const strokesRef = useRef<Point[][]>([]);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);

  function handleGrant(event: GestureResponderEvent) {
    const { locationX, locationY } = event.nativeEvent;
    setCurrentStroke([{ x: locationX, y: locationY }]);
  }

  function handleMove(event: GestureResponderEvent) {
    const { locationX, locationY } = event.nativeEvent;
    setCurrentStroke((prev) => [...prev, { x: locationX, y: locationY }]);
  }

  function handleRelease() {
    setCurrentStroke((prev) => {
      if (prev.length > 1) {
        strokesRef.current = [...strokesRef.current, prev];
        setStrokes(strokesRef.current);
      }
      return [];
    });
  }

  useImperativeHandle(
    ref,
    () => ({
      clear() {
        strokesRef.current = [];
        setStrokes([]);
        setCurrentStroke([]);
      },
      capture() {
        return new Promise((resolve) => {
          if (strokesRef.current.length === 0) {
            resolve(null);
            return;
          }
          svgRef.current?.toDataURL((base64: string) => resolve(`data:image/png;base64,${base64}`));
        });
      }
    }),
    []
  );

  return (
    <View
      style={[styles.container, { width, height }]}
      accessible
      accessibilityLabel="Signature drawing area"
      accessibilityHint="Draw your signature with your finger or stylus"
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={handleGrant}
      onResponderMove={handleMove}
      onResponderRelease={handleRelease}
      testID={testID}
    >
      <Svg ref={svgRef} width={width} height={height}>
        {strokes.map((stroke, index) => (
          <Path key={index} d={pointsToPath(stroke)} stroke="#111" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {currentStroke.length > 0 ? (
          <Path d={pointsToPath(currentStroke)} stroke="#111" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
      </Svg>
    </View>
  );
});

export default SignaturePad;

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    backgroundColor: "#fafafa",
    minHeight: TOUCH_TARGET_MIN * 2
  }
});
