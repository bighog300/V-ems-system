import { UnauthorizedError } from "./http.mjs";

export function startPolling({ enabled, intervalMs, onTick, setTimer = window.setInterval, clearTimer = window.clearInterval }) {
  let pollId = null;

  const stop = () => {
    if (!pollId) return;
    clearTimer(pollId);
    pollId = null;
  };

  const start = () => {
    stop();
    if (!enabled()) return;
    pollId = setTimer(() => void onTick(), intervalMs);
  };

  return { start, stop };
}

export function handleAppError(error, { statusEl, outputEl, unauthorizedMessage = "Session expired. Sign in again.", fallbackPrefix = "Failed:" } = {}) {
  if (error instanceof UnauthorizedError) {
    if (statusEl) statusEl.textContent = unauthorizedMessage;
    if (outputEl) outputEl.innerHTML = `<div class="error-note">${unauthorizedMessage}</div>`;
    return;
  }
  if (statusEl) statusEl.textContent = `${fallbackPrefix} ${error.message}`;
}
