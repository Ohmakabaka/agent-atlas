import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeDatabase } from "./helpers/database";
import { backupDatabase, validateDatabase } from "../scripts/backup";
import { restoreDatabase } from "../scripts/restore";

async function fixture(path: string, value: string) {
  await initializeDatabase(`file:${path}`);
  const db = new DatabaseSync(path);
  db.exec(
    'CREATE TABLE "_prisma_migrations" (migration_name TEXT, checksum TEXT, finished_at TEXT, rolled_back_at TEXT); CREATE TABLE backup_marker (value TEXT);',
  );
  const migrations = (
    await readdir("prisma/migrations", { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const migration of migrations) {
    const checksum = createHash("sha256")
      .update(
        await readFile(join("prisma/migrations", migration, "migration.sql")),
      )
      .digest("hex");
    db.prepare("INSERT INTO _prisma_migrations VALUES (?, ?, ?, NULL)").run(
      migration,
      checksum,
      "2026-11-14T00:00:00Z",
    );
  }
  db.prepare("INSERT INTO backup_marker VALUES (?)").run(value);
  db.close();
}
function marker(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return db.prepare("SELECT value FROM backup_marker").get()?.value;
  } finally {
    db.close();
  }
}

test("online SQLite backup includes WAL and is a validated immutable snapshot", async () => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-backup-"));
  let writer: DatabaseSync | undefined;
  try {
    const source = join(dir, "source.db"),
      target = join(dir, "snapshot.db");
    await fixture(source, "before");
    writer = new DatabaseSync(source);
    writer.exec("PRAGMA journal_mode=WAL");
    writer.prepare("UPDATE backup_marker SET value=?").run("committed in WAL");
    const result = await backupDatabase(source, target);
    assert.ok(result.migrations >= 1);
    assert.equal(marker(target), "committed in WAL");
    writer.prepare("UPDATE backup_marker SET value=?").run("later");
    assert.equal(marker(target), "committed in WAL");
    assert.equal((await stat(target)).mode & 0o777, 0o600);
    await assert.rejects(backupDatabase(source, target), /目标已存在/);
    await assert.rejects(backupDatabase(source, source), /不能与源/);
    await assert.rejects(
      backupDatabase(dir, join(dir, "invalid.db")),
      /普通文件/,
    );
  } finally {
    writer?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("restore requires offline confirmation and preserves the replaced database", async () => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-restore-"));
  try {
    const source = join(dir, "backup.db"),
      target = join(dir, "current.db");
    await fixture(source, "desired");
    await fixture(target, "original");
    await assert.rejects(
      restoreDatabase(source, target, { confirm: true }),
      /offline/,
    );
    assert.equal(marker(target), "original");
    const result = await restoreDatabase(source, target, {
      confirm: true,
      offline: true,
    });
    assert.equal(marker(target), "desired");
    assert.ok(result.preservedDirectory);
    assert.equal(
      marker(join(result.preservedDirectory!, "current.db")),
      "original",
    );
    const manifest = JSON.parse(
      await readFile(join(result.preservedDirectory!, "manifest.json"), "utf8"),
    );
    assert.equal(manifest.files.length, 1);
    assert.equal(manifest.validated, false);
    await assert.rejects(
      restoreDatabase(source, source, { confirm: true, offline: true }),
      /不能相同/,
    );
    await assert.rejects(
      restoreDatabase(source, dir, { confirm: true, offline: true }),
      /普通文件/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("invalid and unknown-schema backups are rejected before changing current data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-restore-invalid-"));
  try {
    const source = join(dir, "backup.db"),
      target = join(dir, "current.db"),
      invalid = join(dir, "invalid.db");
    await fixture(source, "backup");
    await fixture(target, "original");
    await writeFile(invalid, "not a SQLite database");
    await assert.rejects(
      restoreDatabase(invalid, target, { confirm: true, offline: true }),
    );
    assert.equal(marker(target), "original");
    const mutation = new DatabaseSync(source);
    mutation
      .prepare("UPDATE _prisma_migrations SET checksum = ?")
      .run("tampered");
    mutation.close();
    await assert.rejects(validateDatabase(source), /校验和/);
    assert.equal(marker(target), "original");
    // A damaged destination remains recoverable and is preserved byte for byte.
    const good = join(dir, "good.db");
    await fixture(good, "recovered");
    const result = await restoreDatabase(good, invalid, {
      confirm: true,
      offline: true,
    });
    assert.equal(marker(invalid), "recovered");
    assert.equal(
      await readFile(join(result.preservedDirectory!, "invalid.db"), "utf8"),
      "not a SQLite database",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("restore preserves orphaned logs rather than deleting uncertain local state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-orphan-"));
  try {
    const source = join(dir, "backup.db"),
      target = join(dir, "missing.db");
    await fixture(source, "good");
    await writeFile(target + "-wal", "unrecovered data");
    await assert.rejects(
      restoreDatabase(source, target, { confirm: true, offline: true }),
      /日志文件/,
    );
    assert.equal(await readFile(target + "-wal", "utf8"), "unrecovered data");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("health verifies migrated tables without returning internal error details", async () => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-health-"));
  const previous = process.env.DATABASE_URL;
  let db: typeof import("../src/lib/db").prisma | undefined;
  try {
    const path = join(dir, "health.db");
    await fixture(path, "healthy");
    process.env.DATABASE_URL = `file:${path}`;
    db = (await import("../src/lib/db")).prisma;
    const { GET } = await import("../src/app/api/health/route");
    const healthy = await GET();
    assert.equal(healthy.status, 200);
    assert.deepEqual(await healthy.json(), {
      status: "ok",
      database: "ready",
      schema: "current",
    });
    await db.$executeRawUnsafe('DROP TABLE "AuditLog"');
    const failed = await GET();
    assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { status: "unavailable" });
    assert.equal(failed.headers.get("Cache-Control"), "no-store");
  } finally {
    await db?.$disconnect();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
