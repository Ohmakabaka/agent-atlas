import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSession,
  verifySession,
  checkPassword,
  takeLoginAttempt,
} from "../src/lib/auth";

const secret = "a".repeat(48);
const now = Date.UTC(2026, 5, 1);
test("signed sessions reject tampering, expired and foreign signatures", () => {
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
test("login rate limit rejects repeated attempts and recovers after interval", () => {
  for (let i = 0; i < 10; i++) assert.equal(takeLoginAttempt(now), true);
  assert.equal(takeLoginAttempt(now), false);
  assert.equal(takeLoginAttempt(now + 600_001), true);
});
