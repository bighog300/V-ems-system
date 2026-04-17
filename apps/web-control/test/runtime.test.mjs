import test from "node:test";
import assert from "node:assert/strict";

import { ForbiddenError, UnauthorizedError } from "../src/http.mjs";
import { handleAppError, startPolling } from "../src/runtime.mjs";

function createElement() {
  return { textContent: "", innerHTML: "" };
}

test("handleAppError renders session messaging for 401 UnauthorizedError", () => {
  const statusEl = createElement();
  const outputEl = createElement();

  const result = handleAppError(new UnauthorizedError("Session expired", { status: 401 }), {
    statusEl,
    outputEl
  });

  assert.equal(result.authFailure, true);
  assert.equal(result.code, "UNAUTHORIZED");
  assert.match(statusEl.textContent, /Session expired\. Sign in again\./);
  assert.match(outputEl.innerHTML, /Session expired\. Sign in again\./);
});

test("handleAppError renders access denied messaging for 403 ForbiddenError", () => {
  const statusEl = createElement();
  const outputEl = createElement();

  const result = handleAppError(new ForbiddenError("Forbidden", { status: 403 }), {
    statusEl,
    outputEl
  });

  assert.equal(result.authFailure, true);
  assert.equal(result.code, "FORBIDDEN");
  assert.match(statusEl.textContent, /Access denied/);
  assert.match(outputEl.innerHTML, /do not have permission/i);
});

test("handleAppError preserves generic fallback messaging for server errors", () => {
  const statusEl = createElement();
  const outputEl = createElement();

  const result = handleAppError(new Error("Server exploded"), {
    statusEl,
    outputEl,
    fallbackPrefix: "Diagnostics load failed."
  });

  assert.equal(result.authFailure, false);
  assert.equal(result.code, "GENERIC");
  assert.equal(statusEl.textContent, "Diagnostics load failed. Server exploded");
  assert.equal(outputEl.innerHTML, "");
});

test("startPolling stop clears current interval exactly once", () => {
  const timers = [];
  const cleared = [];
  let tick = 0;

  const polling = startPolling({
    enabled: () => true,
    intervalMs: 1000,
    onTick: () => {
      tick += 1;
    },
    setTimer(handler, timeoutMs) {
      timers.push({ id: timers.length + 1, handler, timeoutMs });
      return timers.length;
    },
    clearTimer(id) {
      cleared.push(id);
    }
  });

  polling.start();
  assert.equal(timers.length, 1);
  timers[0].handler();
  assert.equal(tick, 1);

  polling.stop();
  polling.stop();

  assert.deepEqual(cleared, [1]);
});
