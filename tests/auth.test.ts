import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSession,
  verifySession,
  checkPassword,
  createClientToken,
  verifyClientToken,
  trustedClientIp,
} from "../src/lib/auth";
const secret = "a".repeat(48);
const now = Date.UTC(2026, 5, 1);
test("signed sessions reject tampering, expiration and foreign signatures", () => {
  const token = createSession(secret, now);
  assert.equal(verifySession(token, secret, now), true);
  assert.equal(verifySession(token, "b".repeat(48), now), false);
  assert.equal(
    verifySession(
      token.replace(/.$/, token.endsWith("a") ? "b" : "a"),
      secret,
      now,
    ),
    false,
  );
  assert.equal(verifySession(token, secret, now + 12 * 60 * 60 * 1000), false);
  assert.equal(verifySession("anything", secret, now), false);
  assert.equal(verifySession(token, "", now), false);
});
test("password validation has no insecure empty default", () => {
  assert.equal(checkPassword("", ""), false);
  assert.equal(checkPassword("short", "short"), false);
  assert.equal(checkPassword("correct-password", "correct-password"), true);
  assert.equal(checkPassword("wrong-password", "correct-password"), false);
});
test("anonymous client signatures are not usable as editor sessions", () => {
  const token = createClientToken(secret, now);
  assert.equal(verifyClientToken(token, secret, now), true);
  assert.equal(verifySession(token, secret, now), false);
  assert.equal(
    verifyClientToken(createSession(secret, now), secret, now),
    false,
  );
  assert.equal(verifyClientToken(token, secret, now + 31 * 86400_000), false);
  assert.equal(verifyClientToken(`${token}x`, secret, now), false);
});
test("proxy address headers are ignored unless explicitly configured and valid", () => {
  const headers = new Headers({
    "x-real-ip": "203.0.113.25",
    "x-forwarded-for": "203.0.113.25, 10.0.0.1",
  });
  assert.equal(trustedClientIp(headers, false, "x-real-ip"), undefined);
  assert.equal(trustedClientIp(headers, true, ""), undefined);
  assert.equal(trustedClientIp(headers, true, "x-real-ip"), "203.0.113.25");
  assert.equal(trustedClientIp(headers, true, "x-forwarded-for"), undefined);
  assert.equal(
    trustedClientIp(
      new Headers({ "x-real-ip": "pretend-client" }),
      true,
      "x-real-ip",
    ),
    undefined,
  );
});
test("changing the password invalidates existing default sessions", () => {
  const oldPassword = process.env.ADMIN_PASSWORD,
    oldSecret = process.env.SESSION_SECRET;
  try {
    process.env.ADMIN_PASSWORD = "first-password-1234";
    process.env.SESSION_SECRET = secret;
    const token = createSession(undefined, now);
    assert.equal(verifySession(token, undefined, now), true);
    process.env.ADMIN_PASSWORD = "different-password-1234";
    assert.equal(verifySession(token, undefined, now), false);
  } finally {
    if (oldPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = oldPassword;
    if (oldSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = oldSecret;
  }
});
