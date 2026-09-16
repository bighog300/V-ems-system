import assert from "node:assert/strict";
import { test } from "node:test";

import { TABLET_MIN_WIDTH, isTabletWidth } from "../src/theme/breakpoints.ts";

test("isTabletWidth is false below the breakpoint and true at/above it", () => {
  assert.equal(isTabletWidth(TABLET_MIN_WIDTH - 1), false);
  assert.equal(isTabletWidth(TABLET_MIN_WIDTH), true);
  assert.equal(isTabletWidth(TABLET_MIN_WIDTH + 200), true);
});

test("a typical phone-in-landscape width stays under the breakpoint", () => {
  // The largest common phones land around 850-870px landscape width --
  // the breakpoint must sit above that so rotating a phone never
  // accidentally triggers the two-pane tablet shell.
  assert.equal(isTabletWidth(870), false);
});
