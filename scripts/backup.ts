import { DatabaseSync, backup } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  link,
  readFile,
  readdir,
  realpath,
  rm,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { loadEnvConfig } from "@next/env";

export function localDatabasePath(
  configured = process.env.DATABASE_URL || "file:./dev.db",
) {
  if (
    !configured.startsWith("file:") ||
    /[?#]/.test(configured) ||
    configured.includes(":memory:")
  ) {
    throw new Error("备份工具只支持本地 SQLite 文件 DATABASE_URL");
  }
  return resolve(process.cwd(), "prisma", configured.slice(5));
}

export async function regularFile(path: string) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error("路径必须是普通文件，不能是目录或符号链接");
  return realpath(path);
}

export async function targetPath(path: string) {
  const absolute = resolve(path);
  return join(await realpath(dirname(absolute)), basename(absolute));
}

export async function validateDatabase(path: string) {
  const source = await regularFile(path);
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    const integrity = db.prepare("PRAGMA integrity_check").all();
    if (integrity.length !== 1 || Object.values(integrity[0])[0] !== "ok")
      throw new Error("数据库完整性校验失败");
    if (db.prepare("PRAGMA foreign_key_check").all().length)
      throw new Error("数据库外键校验失败");
    const required = [
      "Article",
      "Topic",
      "Source",
      "Relation",
      "_prisma_migrations",
    ];
    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => String(row.name)),
    );
    if (required.some((table) => !tables.has(table)))
      throw new Error("文件不是已迁移的 Agent Atlas 数据库");
    const migrationsRoot = join(process.cwd(), "prisma", "migrations");
    const known = (await readdir(migrationsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const applied = db
      .prepare(
        "SELECT migration_name, checksum, finished_at FROM _prisma_migrations WHERE rolled_back_at IS NULL ORDER BY migration_name",
      )
      .all();
    if (!applied.length) throw new Error("数据库缺少已应用迁移记录");
    for (const [index, migration] of applied.entries()) {
      const name = String(migration.migration_name);
      if (!migration.finished_at || known[index] !== name)
        throw new Error("数据库包含失败、未知或不连续的迁移，拒绝恢复");
      const checksum = createHash("sha256")
        .update(await readFile(join(migrationsRoot, name, "migration.sql")))
        .digest("hex");
      if (checksum !== migration.checksum)
        throw new Error("数据库迁移校验和与当前代码不一致");
    }
    return {
      migrations: applied.length,
      pendingMigrations: known.length - applied.length,
    };
  } finally {
    db.close();
  }
}

/** SQLite's online backup API copies a consistent snapshot, including committed WAL data. */
export async function backupDatabase(
  sourceInput: string,
  destinationInput: string,
) {
  const source = await regularFile(resolve(sourceInput));
  const destination = await targetPath(destinationInput);
  if (source === destination) throw new Error("备份目标不能与源数据库相同");
  try {
    await lstat(destination);
    throw new Error("目标已存在；备份不会覆盖已有文件");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = join(
    dirname(destination),
    `.${basename(destination)}.${randomUUID()}.tmp`,
  );
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    await backup(db, temporary);
    await chmod(temporary, 0o600);
    const validation = await validateDatabase(temporary);
    // Hard-link publishes without overwriting a destination created concurrently.
    await link(temporary, destination);
    return { path: destination, ...validation };
  } finally {
    db.close();
    await rm(temporary, { force: true });
  }
}

async function main() {
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith("--"))
    throw new Error("用法：npm run db:backup -- /安全目录/atlas-backup.db");
  const result = await backupDatabase(localDatabasePath(), args[0]);
  console.log(
    `备份完成并通过完整性校验：${result.path}（${result.migrations} 个已应用迁移）`,
  );
}
if (["backup.ts", "backup.js"].includes(basename(process.argv[1] || "")))
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "备份失败");
    process.exitCode = 1;
  });
