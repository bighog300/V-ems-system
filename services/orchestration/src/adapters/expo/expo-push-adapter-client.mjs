async function unsupportedTransport() {
  throw new Error("Expo push transport is not configured");
}

function wrapTransportError(method, error) {
  const wrapped = new Error(`Expo push adapter ${method} failed: ${error?.message ?? "Unknown transport error"}`);
  wrapped.code = error?.code ?? "DOWNSTREAM_UNAVAILABLE";
  wrapped.classification = error?.classification ?? wrapped.code;
  wrapped.retryable = error?.retryable;
  wrapped.operation = method;
  wrapped.cause = error;
  return wrapped;
}

/**
 * A thin wrapper over Expo's push HTTP API — no per-crew-member DB lookups
 * here (that resolution, matching every other adapter in this codebase,
 * lives in the sync-worker-service closure that calls this). sendPush takes
 * an already-resolved list of Expo push tokens and returns Expo's ticket
 * response verbatim.
 */
export class ExpoPushAdapterClient {
  constructor(options = {}) {
    this.transport = options.transport ?? unsupportedTransport;
  }

  async sendPush({ tokens, title, body, data }) {
    if (!tokens.length) return { sent: 0, tickets: [] };
    const messages = tokens.map((to) => ({ to, title, body, data, sound: "default" }));
    try {
      const result = await this.transport({ method: "sendPush", payload: messages });
      return { sent: messages.length, tickets: result?.data ?? [] };
    } catch (error) {
      throw wrapTransportError("sendPush", error);
    }
  }
}
