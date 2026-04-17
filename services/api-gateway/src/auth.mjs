import { createHmac, createPublicKey, createVerify, timingSafeEqual } from "node:crypto";

const JWKS_CACHE = new Map();

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}

function parseToken(token) {
  const [headerPart, payloadPart, signaturePart] = token.split(".");
  if (!headerPart || !payloadPart || !signaturePart) throw new Error("Malformed JWT");
  return {
    signingInput: `${headerPart}.${payloadPart}`,
    header: JSON.parse(base64UrlDecode(headerPart).toString("utf8")),
    payload: JSON.parse(base64UrlDecode(payloadPart).toString("utf8")),
    signature: base64UrlDecode(signaturePart)
  };
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function verifyHs256(parsed, secret) {
  if (parsed.header.alg !== "HS256") throw new Error("JWT algorithm mismatch");
  const expected = createHmac("sha256", secret).update(parsed.signingInput).digest();
  if (expected.length !== parsed.signature.length || !timingSafeEqual(expected, parsed.signature)) {
    throw new Error("JWT signature validation failed");
  }
}

async function getJwksKey(jwksUri, kid, cacheTtlMs = 300000) {
  if (!kid) throw new Error("JWT kid is required for JWKS verification");

  const cacheKey = `${jwksUri}::${kid}`;
  const cached = JWKS_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.publicKey;

  const response = await fetch(jwksUri, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`JWKS fetch failed with HTTP ${response.status}`);

  const body = await response.json();
  const key = Array.isArray(body?.keys) ? body.keys.find((entry) => entry.kid === kid) : null;
  if (!key) throw new Error(`No JWKS key found for kid=${kid}`);
  if (key.kty !== "RSA") throw new Error(`Unsupported JWKS key type: ${key.kty}`);

  const publicKey = createPublicKey({ key: { kty: "RSA", n: key.n, e: key.e }, format: "jwk" });
  JWKS_CACHE.set(cacheKey, { publicKey, expiresAt: Date.now() + cacheTtlMs });
  return publicKey;
}

async function verifyRs256(parsed, jwksUri, cacheTtlMs) {
  if (parsed.header.alg !== "RS256") throw new Error("JWT algorithm mismatch");
  if (!jwksUri) throw new Error("JWT JWKS URI is not configured");
  const publicKey = await getJwksKey(jwksUri, parsed.header.kid, cacheTtlMs);

  const verifier = createVerify("RSA-SHA256");
  verifier.update(parsed.signingInput);
  verifier.end();

  if (!verifier.verify(publicKey, parsed.signature)) {
    throw new Error("JWT signature validation failed");
  }
}

function validateClaims(payload, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now >= Number(payload.exp)) throw new Error("Token expired");
  if (payload.nbf && now < Number(payload.nbf)) throw new Error("Token not active");
  if (options.issuer && payload.iss !== options.issuer) throw new Error("Token issuer mismatch");
  if (options.audience && !asArray(payload.aud).includes(options.audience)) throw new Error("Token audience mismatch");
}

function claimsToActor(payload) {
  return {
    actorId: payload.sub ?? payload.actor_id ?? null,
    role: String(payload.role ?? payload.user_role ?? "anonymous").toLowerCase()
  };
}

function authenticateViaTrustedHeaders(req) {
  return {
    actorId: req.headers["x-actor-id"] ? String(req.headers["x-actor-id"]) : null,
    role: String(req.headers["x-user-role"] ?? "anonymous").toLowerCase()
  };
}

export async function authenticateRequest(req, options = {}) {
  const trustHeaders = options.trustHeaders === true;

  if (trustHeaders) {
    return authenticateViaTrustedHeaders(req);
  }

  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith("Bearer ")) throw new Error("Missing Bearer token");

  const parsed = parseToken(authorization.slice("Bearer ".length).trim());

  if (parsed.header.alg === "HS256") {
    if (!options.jwtSecret) throw new Error("JWT secret is not configured");
    verifyHs256(parsed, options.jwtSecret);
  } else if (parsed.header.alg === "RS256") {
    await verifyRs256(parsed, options.jwksUri, options.jwksCacheTtlMs);
  } else {
    throw new Error(`Unsupported JWT algorithm: ${parsed.header.alg}`);
  }

  validateClaims(parsed.payload, options);
  return claimsToActor(parsed.payload);
}

export function clearJwksCache() {
  JWKS_CACHE.clear();
}
