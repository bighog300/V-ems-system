function classifyError(error) {
  if (!error) return "UNKNOWN";
  if (typeof error.classification === "string" && error.classification.length > 0) return error.classification;
  if (typeof error.code === "string" && error.code.length > 0) return error.code;
  return "DOWNSTREAM_UNAVAILABLE";
}

export class SyncWorker {
  constructor(options = {}) {
    this.syncIntents = options.syncIntents;
    this.vtiger = options.vtiger;
    this.openemr = options.openemr;
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  async processPending(limit = 100) {
    const intents = this.syncIntents.listPending(limit);
    const results = [];

    for (const intent of intents) {
      results.push(await this.processIntent(intent));
    }

    return results;
  }

  async processCycle(limit = 100) {
    const startedAt = new Date().toISOString();
    const results = await this.processPending(limit);
    const statusCounts = results.reduce((acc, result) => {
      const key = result.status;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      fetchedCount: results.length,
      statusCounts
    };
  }

  resolveAdapter(intent) {
    if (intent.target_system === "vtiger") return this.vtiger;
    if (intent.target_system === "openemr") return this.openemr;
    return undefined;
  }

  async processIntent(intent) {
    const adapter = this.resolveAdapter(intent);
    const methodName = intent.intent_type ?? intent.operation;

    if (!adapter || typeof adapter[methodName] !== "function") {
      return this.handleFailure(intent, new Error(`No adapter method for ${intent.target_system}.${methodName}`));
    }

    try {
      await adapter[methodName](intent.payload);
      this.syncIntents.markSucceeded(intent.intent_id, new Date().toISOString());
      return { intent_id: intent.intent_id, status: "succeeded" };
    } catch (error) {
      return this.handleFailure(intent, error);
    }
  }

  handleFailure(intent, error) {
    const attemptCount = intent.attempt_count + 1;
    const deadLettered = attemptCount >= this.maxAttempts;
    const classification = classifyError(error);

    console.warn(
      `[sync-worker] intent failed intent_id=${intent.intent_id} target=${intent.target_system} method=${intent.intent_type ?? intent.operation} attempt=${attemptCount}/${this.maxAttempts} classification=${classification} dead_lettered=${deadLettered} message=${error?.message ?? "Unknown sync failure"}`
    );

    this.syncIntents.markFailed(intent.intent_id, {
      status: deadLettered ? "dead_lettered" : "pending",
      attempt_count: attemptCount,
      last_error: error?.message ?? "Unknown sync failure",
      last_error_classification: classification,
      dead_lettered_at: deadLettered ? new Date().toISOString() : null
    });

    return { intent_id: intent.intent_id, status: deadLettered ? "dead_lettered" : "pending" };
  }
}
