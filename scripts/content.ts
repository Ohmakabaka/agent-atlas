import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import { createDb } from "../src/lib/db";
import {
  readEditorialPack,
  writeEditorialMarkdown,
  verifyEditorialMarkdown,
} from "../src/lib/editorial/files";
import { importEditorialPack } from "../src/lib/editorial/import";

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "用法：tsx scripts/content.ts [--dir data/editorial] [--dry-run] [--publish] [--render]",
    );
    console.log(
      "默认追加为待审核；--publish 发布新文章；--dry-run 仅验证；--render 只生成 content/guides Markdown，不写数据库。",
    );
    return;
  }
  let directory = resolve("data/editorial");
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dir") {
      if (!args[i + 1] || args[i + 1].startsWith("--"))
        throw new Error("--dir 缺少目录");
      directory = resolve(args[++i]);
    } else if (!["--dry-run", "--publish", "--render"].includes(args[i]))
      throw new Error(`未知选项：${args[i]}`);
  }
  if (
    args.includes("--render") &&
    (args.includes("--publish") || args.includes("--dry-run"))
  )
    throw new Error("--render 不能与 --publish 或 --dry-run 同时使用");
  const entries = await readEditorialPack(directory);
  if (args.includes("--render")) {
    console.log(
      JSON.stringify({ rendered: await writeEditorialMarkdown(entries) }),
    );
    return;
  }
  await verifyEditorialMarkdown(entries);
  const db = createDb();
  try {
    console.log(
      JSON.stringify(
        await importEditorialPack(db, entries, {
          publish: args.includes("--publish"),
          dryRun: args.includes("--dry-run"),
        }),
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "内容导入失败");
  process.exitCode = 1;
});
