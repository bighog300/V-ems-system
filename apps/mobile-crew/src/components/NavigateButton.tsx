import { Linking, Pressable, StyleSheet, Text } from "react-native";

import { TOUCH_TARGET_MIN } from "../theme/a11y.ts";

/**
 * Google Maps' universal search URL rather than a platform-specific scheme
 * (geo:/maps://) -- it opens the native Google Maps app when installed on
 * either platform via App/Universal Links, and falls back to the browser
 * otherwise, without the app needing to know which maps app (if any) is
 * installed or register any platform-specific URL scheme itself. Address
 * text only -- the incident schema carries no lat/lng, only a free-text
 * address, so this is what's actually available to search on.
 */
export function buildNavigateUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export interface NavigateButtonProps {
  address: string | null | undefined;
  onError?: (error: unknown) => void;
}

export default function NavigateButton({ address, onError }: NavigateButtonProps) {
  if (!address) return null;

  async function handlePress() {
    try {
      await Linking.openURL(buildNavigateUrl(address as string));
    } catch (error) {
      onError?.(error);
    }
  }

  return (
    <Pressable onPress={handlePress} accessibilityRole="button" accessibilityLabel={`Navigate to ${address}`} style={styles.button} testID="navigate-button">
      <Text style={styles.text}>Navigate ↗</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TOUCH_TARGET_MIN,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1a4fd6",
    backgroundColor: "#eef2ff"
  },
  text: {
    color: "#1a4fd6",
    fontSize: 14,
    fontWeight: "700"
  }
});
