// Stage 12 milestone 12f: shared building blocks for refusing to start in
// production mode with an insecure/default secret. Used by every module
// that resolves a security-sensitive value from the environment (the
// object-storage encryption key, the Postgres connection string, the JWT
// signing secret) so the same definition of "insecure" applies everywhere,
// and by each of the independent processes that construct those modules
// (api-gateway's HTTP server, orchestration's sync-worker service).

const PLACEHOLDER_SECRET_VALUES = new Set([
  "__set_in_local_env__",
  "changeme",
  "change_me",
  "change-me",
  "password",
  "secret",
  "test",
  "test-secret",
  "default",
  "insecure",
  "postgres",
  "example",
  ""
]);

export function isProductionEnv(env = process.env) {
  return (env.APP_ENV ?? "development") === "production";
}

/** True for a missing value, or one of a small set of common insecure/placeholder defaults. */
export function isInsecureSecret(value) {
  if (value === undefined || value === null) return true;
  const normalized = String(value).trim().toLowerCase();
  return normalized.length === 0 || PLACEHOLDER_SECRET_VALUES.has(normalized);
}

/** True if a connection string embeds one of the same common insecure/placeholder passwords. */
export function connectionStringHasInsecurePassword(connectionString) {
  const match = /:\/\/[^/@]*:([^@]*)@/.exec(connectionString ?? "");
  if (!match) return false;
  return isInsecureSecret(decodeURIComponent(match[1]));
}
