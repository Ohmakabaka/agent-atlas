import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initializeDatabase } from "./helpers/database";
let directory: string;
let db: typeof import("../src/lib/db").prisma;
let sync: typeof import("../src/lib/ingestion/scheduler");
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "atlas-scheduler-"));
  process.env.DATABASE_URL = `file:${join(directory, "test.db")}`;
  await initializeDatabase(process.env.DATABASE_URL);
  db = (await import("../src/lib/db")).prisma;
  sync = await import("../src/lib/ingestion/scheduler");
});
after(async () => {
  await db?.$disconnect();
  if (directory) await rm(directory, { recursive: true, force: true });
});
const feed =
  '<?xml version="1.0"?><rss version="2.0"><channel><title>工程订阅</title><link>https://example.org</link><description>实践</description><item><title>Agent evals</title><link>https://example.org/evals</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item></channel></rss>';

test("scheduler imports once, persists HTTP validators, skips not-due feeds, and processes 304", async () => {
  const source = await db.source.create({
    data: {
      slug: "feed",
      name: "Feed",
      url: "https://example.org",
      feedUrl: "https://example.org/feed",
      platform: "web",
      type: "official",
      syncIntervalMinutes: 60,
    },
  });
  let requests = 0;
  const first = await sync.runSourceSync(
    { sourceId: source.id },
    async (url, _redirects, options) => {
      requests++;
      assert.deepEqual(options?.headers, {});
      return {
        url,
        status: 200,
        text: feed,
        contentType: "application/rss+xml",
        etag: '"v1"',
        lastModified: "Mon, 01 Jan 2024 00:00:00 GMT",
      };
    },
  );
  assert.equal(first.imported, 1);
  assert.equal(
    await db.article.count({ where: { status: "pending_review" } }),
    1,
  );
  const scheduled = await sync.runSourceSync(
    { sourceId: source.id },
    async () => {
      throw Error("should not fetch");
    },
  );
  assert.equal(scheduled.skipped, 1);
  const conditional = await sync.runSourceSync(
    { sourceId: source.id, force: true },
    async (url, _redirects, options) => {
      requests++;
      assert.equal(options?.headers?.["If-None-Match"], '"v1"');
      return { url, status: 304, text: "", contentType: "" };
    },
  );
  assert.equal(conditional.notModified, 1);
  assert.equal(requests, 2);
  assert.equal(await db.article.count(), 1);
  assert.ok(
    (await db.source.findUniqueOrThrow({ where: { id: source.id } }))
      .lastSuccessAt,
  );
  assert.equal(await db.syncLease.count(), 0);
});

test("lease excludes concurrent source work and expires without deleting another owner", async () => {
  const now = new Date();
  assert.equal(await sync.acquireLease("test-lock", "first", now), true);
  assert.equal(await sync.acquireLease("test-lock", "second", now), false);
  await sync.releaseLease("test-lock", "second");
  assert.equal(await db.syncLease.count({ where: { key: "test-lock" } }), 1);
  assert.equal(
    await sync.acquireLease(
      "test-lock",
      "second",
      new Date(now.getTime() + 121000),
    ),
    true,
  );
  await sync.releaseLease("test-lock", "second");
});

test("failure is recorded and other sources continue; force retries work", async () => {
  const broken = await db.source.create({
    data: {
      slug: "a-broken",
      name: "A broken",
      url: "https://broken.org",
      feedUrl: "https://broken.org/feed",
      platform: "web",
      type: "official",
    },
  });
  const good = await db.source.create({
    data: {
      slug: "z-good",
      name: "Z good",
      url: "https://other.org",
      feedUrl: "https://other.org/feed",
      platform: "web",
      type: "official",
    },
  });
  const result = await sync.runSourceSync({ force: true }, async (url) => {
    if (url.includes("broken")) throw Error("HTTP 503 test");
    return {
      url,
      status: 200,
      text: feed.replaceAll(
        "https://example.org/evals",
        "https://other.org/evals",
      ),
      contentType: "application/rss+xml",
    };
  });
  assert.equal(result.errors.length, 1);
  assert.ok(result.imported >= 1);
  assert.match(
    (await db.source.findUniqueOrThrow({ where: { id: broken.id } }))
      .lastError || "",
    /503/,
  );
  assert.equal(
    await db.ingestionJob.count({
      where: { sourceId: broken.id, status: "failed" },
    }),
    1,
  );
  const retry = await sync.runSourceSync(
    { sourceId: broken.id, force: true },
    async (url) => ({
      url,
      status: 200,
      text: feed.replaceAll(
        "https://example.org/evals",
        "https://broken.org/evals",
      ),
      contentType: "application/rss+xml",
    }),
  );
  assert.equal(retry.imported, 1);
  assert.equal(
    (await db.source.findUniqueOrThrow({ where: { id: broken.id } })).lastError,
    null,
  );
  assert.ok(
    await db.ingestionJob.count({
      where: { sourceId: good.id, status: "completed" },
    }),
  );
});

test("cancellation avoids starting queued sources and leaves no held locks", async () => {
  const controller = new AbortController();
  controller.abort();
  let requests = 0;
  const result = await sync.runSourceSync(
    { force: true, signal: controller.signal },
    async () => {
      requests++;
      throw Error("not called");
    },
  );
  assert.equal(requests, 0);
  assert.equal(result.imported, 0);
  assert.equal(await db.syncLease.count(), 0);
});

test("worker shuts down cleanly on SIGTERM without an active source", async () => {
  const { spawn } = await import("node:child_process");
  const emptyUrl = `file:${join(directory, "worker.db")}`;
  await initializeDatabase(emptyUrl);
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/worker.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: emptyUrl,
        INGESTION_POLL_SECONDS: "5",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "",
    errors = "",
    stopped = false;
  const exit = new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
  child.stderr.on("data", (chunk) => {
    errors += chunk.toString();
  });
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
    if (!stopped && output.includes('"sources":0')) {
      stopped = true;
      child.kill("SIGTERM");
    }
  });
  try {
    assert.equal(await exit, 0, errors);
    assert.match(output, /采集进程已停止/);
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
});
