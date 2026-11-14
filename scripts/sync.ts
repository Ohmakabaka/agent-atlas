import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { syncSources } = await import("../src/lib/ingestion");
  const { prisma } = await import("../src/lib/db");
  const args = process.argv.slice(2);
  let force = false,
    sourceId: string | undefined;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--force") force = true;
    else if (
      args[index] === "--source" &&
      args[index + 1] &&
      !args[index + 1].startsWith("--")
    )
      sourceId = args[++index];
    else
      throw new Error("用法：npm run ingest -- [--force] [--source SOURCE_ID]");
  }
  const controller = new AbortController();
  process.once("SIGTERM", () => controller.abort());
  process.once("SIGINT", () => controller.abort());
  try {
    const result = await syncSources({
      force,
      sourceId,
      signal: controller.signal,
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "同步失败");
  process.exitCode = 1;
});
