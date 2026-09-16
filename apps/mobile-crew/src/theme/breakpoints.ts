// Stage 15 milestone 15a: the width above which the app renders its
// landscape tablet split-view shell instead of the phone stack. Chosen
// above the largest common phone's landscape width (so a phone rotated
// sideways doesn't accidentally trigger a two-pane layout with no room
// for it) and comfortably below a 10"+ tablet's landscape width.
//
// Deliberately has no react-native import (see useIsTabletLayout.ts for
// the hook that reads the actual window width) -- this file's plain
// arithmetic is unit-tested directly under plain node --test, which can't
// load a module that imports react-native at all, mirroring how
// theme/a11y.ts's constants stay react-native-free for the same reason.
export const TABLET_MIN_WIDTH = 900;

export function isTabletWidth(width: number): boolean {
  return width >= TABLET_MIN_WIDTH;
}
