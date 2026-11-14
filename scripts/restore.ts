import {
  copyFile,
  lstat,
  mkdir,
  rename,
  rm,
  writeFile,
  chmod,
} from "node:fs/promises";
import { constants, createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import {
  backupDatabase,
  localDatabasePath,
  regularFile,
  targetPath,
  validateDatabase,
} from "./backup";

async function fileChecksum(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function restoreDatabase(
  sourceInput: string,
  targetInput: string,
  options: { confirm?: boolean; offline?: boolean },
) {
  if (!options.confirm || !options.offline)
    throw new Error("恢复要求 --confirm --offline；请先停止 Web 和采集 worker");
  const source = await regularFile(resolve(sourceInput));
  const target = await targetPath(targetInput);
  if (source === target) throw new Error("备份源与恢复目标不能相同");
  const validation = await validateDatabase(source);
  let targetExists = false;
  try {
    await regularFile(target);
    targetExists = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!targetExists) {
    for (const suffix of ["-wal", "-shm"]) {
      try {
        await lstat(target + suffix);
        throw new Error(
          "目标数据库缺失但存在日志文件，请先保留并人工检查，拒绝自动删除",
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
  const temporary = join(
    dirname(target),
    `.${basename(target)}.restore-${randomUUID()}.db`,
  );
  let preservedDirectory: string | null = null;
  try {
    await backupDatabase(source, temporary);
    if (targetExists) {
      preservedDirectory = `${target}.before-restore-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
      await mkdir(preservedDirectory, { mode: 0o700 });
      const preserved: { name: string; sha256: string }[] = [];
      // The caller explicitly declares the service offline. Keep main + WAL + SHM,
      // including a damaged current DB, so restoration never discards forensic data.
      for (const suffix of ["", "-wal", "-shm"]) {
        const original = target + suffix;
        try {
          const info = await lstat(original);
          if (!info.isFile() || info.isSymbolicLink())
            throw new Error("当前数据库及其日志必须是普通文件");
          const saved = join(preservedDirectory, basename(original));
          await copyFile(original, saved, constants.COPYFILE_EXCL);
          await chmod(saved, 0o600);
          const before = await fileChecksum(original);
          const after = await fileChecksum(saved);
          if (before !== after)
            throw new Error(
              "原数据库保留副本校验失败；请确认所有写入进程已停止",
            );
          preserved.push({ name: basename(original), sha256: after });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      await writeFile(
        join(preservedDirectory, "manifest.json"),
        JSON.stringify(
          {
            preservedAt: new Date().toISOString(),
            validated: false,
            note: "离线恢复前的原始文件，可能包含损坏状态。",
            files: preserved,
          },
          null,
          2,
        ),
        { mode: 0o600, flag: "wx" },
      );
    }
    await rm(`${target}-wal`, { force: true });
    await rm(`${target}-shm`, { force: true });
    await rename(temporary, target);
    await chmod(target, 0o600);
    return { path: target, preservedDirectory, ...validation };
  } finally {
    await rm(temporary, { force: true });
  }
}

async function main() {
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  const source = args.find((arg) => !arg.startsWith("--"));
  if (
    !source ||
    args.some(
      (arg) =>
        arg.startsWith("--") && !["--confirm", "--offline"].includes(arg),
    ) ||
    args.filter((arg) => !arg.startsWith("--")).length !== 1
  )
    throw new Error(
      "用法：npm run db:restore -- /安全目录/atlas-backup.db --confirm --offline",
    );
  const result = await restoreDatabase(source, localDatabasePath(), {
    confirm: args.includes("--confirm"),
    offline: args.includes("--offline"),
  });
  console.log(`数据库已恢复：${result.path}`);
  if (result.preservedDirectory)
    console.log(`原文件已保留：${result.preservedDirectory}`);
  console.log("重启前执行 npm run db:migrate，再检查 /api/health 和编辑流程。");
}
if (["restore.ts", "restore.js"].includes(basename(process.argv[1] || "")))
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "恢复失败");
    process.exitCode = 1;
  });
