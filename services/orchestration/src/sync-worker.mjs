function classifyError(error) {
  if (!error) return "UNKNOWN";
  if (typeof error.classification === "string" && error.classification.length > 0) return error.classification;
  if (typeof error.code === "string" && error.code.length > 0) return error.code;
  return "DOWNSTREAM_UNAVAILABLE";
}

const NON_RETRYABLE = new Set(["VTIGER_AUTH_FAILED", "VTIGER_PERMISSION_DENIED", "VTIGER_VALIDATION_FAILED", "VTIGER_SCHEMA_MISMATCH", "VTIGER_DUPLICATE_CONFLICT"]);

function createSyncWorkerMetrics() {
  return {
    started_at: new Date().toISOString(),
    processed_intents: 0,
    succeeded_intents: 0,
    failed_intents: 0,
    dead_lettered_intents: 0
  };
}

export class SyncWorker {
  constructor(options = {}) {
    this.syncIntents = options.syncIntents;
    this.vtiger = options.vtiger;
    this.openemr = options.openemr;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseBackoffMs = options.baseBackoffMs ?? 0;
    this.maxBackoffMs = options.maxBackoffMs ?? 60000;
    this.leaseMs = options.leaseMs ?? 30000;
    this.onSuccess = options.onSuccess;
    this.onFailure = options.onFailure;
    this.metrics = options.metrics ?? createSyncWorkerMetrics();
  }

  async processPending(limit = 100) {
    const intents = this.syncIntents.listPending(limit);
    const results = [];

    for (const intent of intents) {
      const token = `${process.pid}-${Date.now()}-${intent.intent_id}`;
      if (typeof this.syncIntents.claim === "function" && !this.syncIntents.claim(intent.intent_id, token, this.leaseMs ?? 30000)) continue;
      results.push(await this.processIntent({ ...intent, claim_token: token }));
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
      statusCounts,
      metrics: this.getMetrics()
    };
  }

  resolveAdapter(intent) {
    if (intent.target_system === "vtiger") return this.vtiger;
    if (intent.target_system === "openemr") return this.openemr;
    return undefined;
  }

  async processIntent(intent) {
    this.metrics.processed_intents += 1;
    const adapter = this.resolveAdapter(intent);
    const methodName = intent.intent_type ?? intent.operation;

    if (!adapter || typeof adapter[methodName] !== "function") {
      return this.handleFailure(intent, new Error(`No adapter method for ${intent.target_system}.${methodName}`));
    }

    try {
      const result = await adapter[methodName](intent.payload);
      const handled = this.onSuccess ? await this.onSuccess(intent, result) : false;
      if (!handled) this.syncIntents.markSucceeded(intent.intent_id, new Date().toISOString());
      this.metrics.succeeded_intents += 1;
      return { intent_id: intent.intent_id, status: "succeeded" };
    } catch (error) {
      return this.handleFailure(intent, error);
    }
  }

  handleFailure(intent, error) {
    if (error?.code === "VTIGER_DEPENDENCY_PENDING") {
      const nextAttemptAt = new Date(Date.now() + Math.max(1000, this.baseBackoffMs || 1000)).toISOString();
      this.syncIntents.markFailed(intent.intent_id, {
        status: "pending",
        attempt_count: intent.attempt_count,
        last_error: error.message,
        last_error_classification: "VTIGER_DEPENDENCY_PENDING",
        dead_lettered_at: null,
        next_attempt_at: nextAttemptAt,
        retryable: true,
        outcome_unknown: false
      });
      if (this.onFailure) this.onFailure(intent, error, { status: "pending", attemptCount: intent.attempt_count, retryable: true, nextAttemptAt });
      return { intent_id: intent.intent_id, status: "pending" };
    }
    const attemptCount = intent.attempt_count + 1;
    const classification = classifyError(error);
    const retryable = error?.retryable ?? !NON_RETRYABLE.has(classification);
    const deadLettered = !retryable || attemptCount >= this.maxAttempts;

    console.warn(
      `[sync-worker] intent failed intent_id=${intent.intent_id} target=${intent.target_system} method=${intent.intent_type ?? intent.operation} attempt=${attemptCount}/${this.maxAttempts} classification=${classification} dead_lettered=${deadLettered} message=${error?.message ?? "Unknown sync failure"}`
    );

    const delayMs = this.baseBackoffMs === 0
      ? 0
      : Math.max(1000, Math.min(this.maxBackoffMs, this.baseBackoffMs * (2 ** Math.max(0, attemptCount - 1)) + Math.floor(Math.random() * 250)));
    const nextAttemptAt = deadLettered ? null : new Date(Date.now() + delayMs).toISOString();

    this.syncIntents.markFailed(intent.intent_id, {
      status: deadLettered ? "dead_lettered" : "pending",
      attempt_count: attemptCount,
      last_error: error?.message ?? "Unknown sync failure",
      last_error_classification: classification,
      dead_lettered_at: deadLettered ? new Date().toISOString() : null,
      next_attempt_at: nextAttemptAt,
      retryable,
      outcome_unknown: Boolean(error?.outcomeUnknown)
    });
    if (this.onFailure) this.onFailure(intent, error, { status: deadLettered ? "dead_lettered" : "retrying", attemptCount, retryable, nextAttemptAt });

    this.metrics.failed_intents += 1;
    if (deadLettered) this.metrics.dead_lettered_intents += 1;

    return { intent_id: intent.intent_id, status: deadLettered ? "dead_lettered" : "pending" };
  }

  getMetrics() {
    return {
      ...this.metrics
    };
  }
}
