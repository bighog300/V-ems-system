// Stage 12 milestone 12i: per-actor request throttling. A fixed-size
// sliding window per key (actor_id when authenticated, the client's
// remote address otherwise) -- in-process, in-memory, no external
// dependency. That's a real limitation: state isn't shared across
// multiple api-gateway instances behind a load balancer, so each instance
// enforces its own limit independently rather than one true global limit
// per actor. That's an acceptable trade for this stage (no Redis client is
// currently wired into api-gateway) and still stops the case this
// milestone targets -- one client/actor hammering a single instance --
// without adding a new runtime dependency; a shared store is future work
// if/when api-gateway actually runs more than one instance.
export function createRateLimiter({ windowMs, maxRequests }) {
  const hits = new Map(); // key -> sorted timestamps (ms) within the current window
  let checksSinceSweep = 0;
  const SWEEP_INTERVAL = 500;

  function pruneTimestamps(timestamps, now) {
    const cutoff = now - windowMs;
    let start = 0;
    while (start < timestamps.length && timestamps[start] <= cutoff) start += 1;
    return start > 0 ? timestamps.slice(start) : timestamps;
  }

  // Drops keys with no timestamps left in the current window -- otherwise
  // every distinct actor/IP that has ever made one request stays in the
  // map forever, an unbounded (if slow) memory leak over a long-lived
  // process. Runs opportunistically every SWEEP_INTERVAL checks rather
  // than on a timer, so it costs nothing when the limiter is idle.
  function sweep(now) {
    for (const [key, timestamps] of hits) {
      const pruned = pruneTimestamps(timestamps, now);
      if (pruned.length === 0) hits.delete(key);
      else if (pruned !== timestamps) hits.set(key, pruned);
    }
  }

  return {
    check(key, now = Date.now()) {
      checksSinceSweep += 1;
      if (checksSinceSweep >= SWEEP_INTERVAL) {
        checksSinceSweep = 0;
        sweep(now);
      }

      const existing = hits.get(key) ?? [];
      const pruned = pruneTimestamps(existing, now);

      if (pruned.length >= maxRequests) {
        hits.set(key, pruned);
        const retryAfterMs = Math.max(pruned[0] + windowMs - now, 0);
        return { allowed: false, remaining: 0, retryAfterMs };
      }

      pruned.push(now);
      hits.set(key, pruned);
      return { allowed: true, remaining: maxRequests - pruned.length, retryAfterMs: 0 };
    },
    // Test/diagnostic hook -- the number of distinct keys currently tracked.
    size() {
      return hits.size;
    }
  };
}
