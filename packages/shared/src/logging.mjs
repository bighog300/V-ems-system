const LOG_LEVELS = ["debug", "info", "warn", "error"];

function normalizeLevel(level) {
  const candidate = String(level ?? "info").toLowerCase();
  return LOG_LEVELS.includes(candidate) ? candidate : "info";
}

function shouldLog(configuredLevel, eventLevel) {
  return LOG_LEVELS.indexOf(eventLevel) >= LOG_LEVELS.indexOf(configuredLevel);
}

function safeJson(value) {
  if (value === undefined) return undefined;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }
  return value;
}

export function createLogger({ serviceName, level = process.env.LOG_LEVEL } = {}) {
  const configuredLevel = normalizeLevel(level);

  function log(eventLevel, message, fields = {}) {
    const normalizedEventLevel = normalizeLevel(eventLevel);
    if (!shouldLog(configuredLevel, normalizedEventLevel)) return;

    const entry = {
      timestamp: new Date().toISOString(),
      service_name: serviceName,
      level: normalizedEventLevel,
      message,
      ...fields
    };

    const serialized = JSON.stringify(entry, (_, value) => safeJson(value));
    if (normalizedEventLevel === "error") {
      console.error(serialized);
      return;
    }

    if (normalizedEventLevel === "warn") {
      console.warn(serialized);
      return;
    }

    console.log(serialized);
  }

  return {
    debug: (message, fields) => log("debug", message, fields),
    info: (message, fields) => log("info", message, fields),
    warn: (message, fields) => log("warn", message, fields),
    error: (message, fields) => log("error", message, fields)
  };
}
