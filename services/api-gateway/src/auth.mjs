import { createHmac, timingSafeEqual } from "node:crypto";

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

function verifyHs256(parsed, secret) {
  if (parsed.header.alg !== "HS256") throw new Error("Only HS256 JWT is supported by current gateway configuration");
  const expected = createHmac("sha256", secret).update(parsed.signingInput).digest();
  if (expected.length !== parsed.signature.length || !timingSafeEqual(expected, parsed.signature)) {
    throw new Error("JWT signature validation failed");
  }
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function authenticateRequest(req, options = {}) {
  const trustHeaders = options.trustHeaders === true;

  if (trustHeaders) {
    return {
      actorId: req.headers["x-actor-id"] ? String(req.headers["x-actor-id"]) : null,
      role: String(req.headers["x-user-role"] ?? "anonymous").toLowerCase()
    };
  }

  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith("Bearer ")) throw new Error("Missing Bearer token");

  const jwtSecret = options.jwtSecret;
  if (!jwtSecret) throw new Error("JWT secret is not configured");

  const parsed = parseToken(authorization.slice("Bearer ".length).trim());
  verifyHs256(parsed, jwtSecret);

  const now = Math.floor(Date.now() / 1000);
  if (parsed.payload.exp && now >= Number(parsed.payload.exp)) throw new Error("Token expired");
  if (parsed.payload.nbf && now < Number(parsed.payload.nbf)) throw new Error("Token not active");
  if (options.issuer && parsed.payload.iss !== options.issuer) throw new Error("Token issuer mismatch");
  if (options.audience && !asArray(parsed.payload.aud).includes(options.audience)) throw new Error("Token audience mismatch");

  return {
    actorId: parsed.payload.sub ?? parsed.payload.actor_id ?? null,
    role: String(parsed.payload.role ?? parsed.payload.user_role ?? "anonymous").toLowerCase()
  };
}
