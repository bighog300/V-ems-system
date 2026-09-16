import { useWindowDimensions } from "react-native";

import { isTabletWidth } from "./breakpoints.ts";

export function useIsTabletLayout(): boolean {
  const { width } = useWindowDimensions();
  return isTabletWidth(width);
}
