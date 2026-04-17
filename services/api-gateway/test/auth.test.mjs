import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, createSign, generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import { authenticateRequest, clearJwksCache } from "../src/auth.mjs";

function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64url");
}

function signHsToken(payload, secret, header = { alg: "HS256", typ: "JWT" }) {
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

function signRsToken(payload, privateKey, header = { alg: "RS256", typ: "JWT", kid: "test-key" }) {
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${signer.sign(privateKey).toString("base64url")}`;
}

function reqWithToken(token) {
  return { headers: { authorization: `Bearer ${token}` } };
}

test("authenticateRequest validates HS256 token and claims", async () => {
  const token = signHsToken({ sub: "STAFF-1", role: "dispatcher", exp: Math.floor(Date.now() / 1000) + 60, iss: "issuer", aud: "aud" }, "secret");
  const actor = await authenticateRequest(reqWithToken(token), {
    jwtSecret: "secret",
    issuer: "issuer",
    audience: "aud"
  });

  assert.equal(actor.actorId, "STAFF-1");
  assert.equal(actor.role, "dispatcher");
});

test("authenticateRequest rejects invalid HS256 signature", async () => {
  const token = signHsToken({ sub: "STAFF-1", role: "dispatcher", exp: Math.floor(Date.now() / 1000) + 60 }, "wrong-secret");
  await assert.rejects(
    authenticateRequest(reqWithToken(token), { jwtSecret: "secret" }),
    /signature validation failed/
  );
});

test("authenticateRequest rejects expired token", async () => {
  const token = signHsToken({ sub: "STAFF-1", role: "dispatcher", exp: Math.floor(Date.now() / 1000) - 30 }, "secret");
  await assert.rejects(authenticateRequest(reqWithToken(token), { jwtSecret: "secret" }), /Token expired/);
});

test("authenticateRequest rejects invalid issuer and audience", async () => {
  const token = signHsToken({ sub: "STAFF-1", role: "dispatcher", exp: Math.floor(Date.now() / 1000) + 60, iss: "issuer-a", aud: "aud-a" }, "secret");
  await assert.rejects(authenticateRequest(reqWithToken(token), {
    jwtSecret: "secret",
    issuer: "issuer-b",
    audience: "aud-a"
  }), /issuer mismatch/);

  await assert.rejects(authenticateRequest(reqWithToken(token), {
    jwtSecret: "secret",
    issuer: "issuer-a",
    audience: "aud-b"
  }), /audience mismatch/);
});

test("authenticateRequest supports RS256 + JWKS", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });

  const server = createServer((req, res) => {
    if (req.url === "/.well-known/jwks.json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ keys: [{ kty: "RSA", kid: "test-key", n: jwk.n, e: jwk.e }] }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    clearJwksCache();
    const token = signRsToken({ sub: "STAFF-RSA", role: "supervisor", exp: Math.floor(Date.now() / 1000) + 60 }, privateKey);
    const actor = await authenticateRequest(reqWithToken(token), {
      jwksUri: `http://127.0.0.1:${port}/.well-known/jwks.json`
    });
    assert.equal(actor.actorId, "STAFF-RSA");
    assert.equal(actor.role, "supervisor");
  } finally {
    server.close();
    clearJwksCache();
  }
});
