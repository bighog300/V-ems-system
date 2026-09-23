const DEVELOPMENT_PROFILE = "development";
const STAGING_PROFILES = new Set(["staging", "stage", "production", "prod"]);
const MIN_TTL_SECONDS = 900;
const MAX_TTL_SECONDS = 7200;

function exactTrue(value) {
  return value === "true";
}

function profileValues(env) {
  return [env.NODE_ENV, env.APP_ENV, env.APP_PROFILE, env.DEPLOYMENT_ENV, env.RELEASE_CHANNEL]
    .filter((value) => typeof value === "string" && value.length > 0)
    .map((value) => value.toLowerCase());
}

export function validateDevelopmentTestAuthConfig(env = process.env) {
  const enabled = exactTrue(env.VEMS_ENABLE_DEVELOPMENT_TEST_AUTH);
  const profiles = profileValues(env);
  const profileBlocked = profiles.some((profile) => STAGING_PROFILES.has(profile));
  const development = env.NODE_ENV === DEVELOPMENT_PROFILE &&
    (env.APP_ENV ?? DEVELOPMENT_PROFILE) === DEVELOPMENT_PROFILE &&
    !profileBlocked &&
    !exactTrue(env.VEMS_SECURE_STARTUP);

  if (enabled && !development) {
    throw new Error("VEMS development test authentication requires NODE_ENV=development, APP_ENV=development, and a non-release profile.");
  }

  const rawTtl = env.VEMS_DEVELOPMENT_TEST_SESSION_TTL_SECONDS;
  const ttlSeconds = rawTtl === undefined ? 3600 : Number(rawTtl);
  if (enabled && (!Number.isInteger(ttlSeconds) || ttlSeconds < MIN_TTL_SECONDS || ttlSeconds > MAX_TTL_SECONDS)) {
    throw new Error(`VEMS_DEVELOPMENT_TEST_SESSION_TTL_SECONDS must be an integer from ${MIN_TTL_SECONDS} to ${MAX_TTL_SECONDS}.`);
  }

  if (enabled && (isInsecureSecret(env.JWT_HS256_SECRET) || !env.JWT_ISSUER || !env.JWT_AUDIENCE)) {
    throw new Error("Development test authentication requires the normal JWT signing secret, issuer, and audience configuration.");
  }

  return { enabled, ttlSeconds };
}

export const DEVELOPMENT_TEST_ACTOR = Object.freeze({
  actorId: "STAFF-001",
  role: "field_crew",
  purpose: "stage14_android_acceptance"
});

export function isSuitableTestCrew(personnel) {
  return Boolean(
    personnel &&
    personnel.staff_id === DEVELOPMENT_TEST_ACTOR.actorId &&
    personnel.role === DEVELOPMENT_TEST_ACTOR.role &&
    !["Inactive", "Suspended"].includes(personnel.operational_status)
  );
}

export function developmentTestSessionClaims({ issuedAt, expiresAt }) {
  return {
    sub: DEVELOPMENT_TEST_ACTOR.actorId,
    role: DEVELOPMENT_TEST_ACTOR.role,
    iss: undefined,
    aud: undefined,
    iat: issuedAt,
    exp: expiresAt,
    synthetic_test_session: true,
    authentication_method: "development_test_session",
    purpose: DEVELOPMENT_TEST_ACTOR.purpose
  };
}
import { isInsecureSecret } from "@vems/shared";
