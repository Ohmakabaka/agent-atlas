import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initializeDatabase } from "./helpers/database";
let directory: string;
let db: typeof import("../src/lib/db").prisma;
let auth: typeof import("../src/lib/auth");
const now = Date.UTC(2026, 5, 1);
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "atlas-auth-"));
  process.env.DATABASE_URL = `file:${join(directory, "auth.db")}`;
  await initializeDatabase(process.env.DATABASE_URL);
  db = (await import("../src/lib/db")).prisma;
  auth = await import("../src/lib/auth");
});
after(async () => {
  await db?.$disconnect();
  if (directory) await rm(directory, { recursive: true, force: true });
});
test("login budgets isolate clients and survive database reconnection", async () => {
  for (let i = 0; i < 10; i++)
    assert.equal((await auth.takeLoginAttempt("client-a", now)).allowed, true);
  const denied = await auth.takeLoginAttempt("client-a", now);
  assert.equal(denied.allowed, false);
  assert.equal(denied.blockedBy, "client");
  assert.equal(denied.logBlocked, true);
  assert.equal((await auth.takeLoginAttempt("client-b", now)).allowed, true);
  await db.$disconnect();
  assert.equal((await auth.takeLoginAttempt("client-a", now)).allowed, false);
  assert.equal(
    (await auth.takeLoginAttempt("client-a", now + 600_001)).allowed,
    true,
  );
});
test("a wider shared budget limits anonymous-cookie churn without password bypass", async () => {
  const time = now + 2 * 600_000;
  for (let i = 0; i < 300; i++)
    assert.equal(
      (await auth.takeLoginAttempt(`separate-client-${i}`, time)).allowed,
      true,
    );
  const blocked = await auth.takeLoginAttempt("fresh-cookie", time);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.blockedBy, "global");
  assert.equal(
    (await auth.takeLoginAttempt("fresh-cookie", time + 600_000)).allowed,
    true,
  );
});
test("authentication audit omits credentials and raw client identifiers", async () => {
  await auth.recordAuthentication("login_failed");
  await auth.recordAuthentication("login_rate_limited", { scope: "client" });
  await auth.recordAuthentication("login_success");
  await auth.recordAuthentication("logout");
  const events = await db.auditLog.findMany({ orderBy: { createdAt: "asc" } });
  assert.equal(events.length, 4);
  assert.ok(
    events.every(
      (e) => e.entityType === "authentication" && e.entityId === "editor",
    ),
  );
  assert.ok(
    events.every(
      (e) => !JSON.stringify(e.detail).match(/password|cookie|secret|token/i),
    ),
  );
});
