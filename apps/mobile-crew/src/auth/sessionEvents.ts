// The server rejecting the signed-in session (revoked by a supervisor, or a token it no longer accepts) is not a failure of
// whichever request happened to notice it: every screen and the background sync would show its own raw error while the
// app carried on as if signed in. requestJson reports it here once, and the root of the app signs the crew member out.
export type SessionRejection = "revoked" | "invalid";

type Listener = (rejection: SessionRejection) => void;
const listeners = new Set<Listener>();

export function onSessionRejected(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function emitSessionRejected(rejection: SessionRejection): void {
  for (const listener of [...listeners]) {
    try { listener(rejection); } catch { /* a listener must not break the request that reported this */ }
  }
}
