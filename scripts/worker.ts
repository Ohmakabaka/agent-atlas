import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { syncSources } = await import("../src/lib/ingestion");
  const { prisma } = await import("../src/lib/db");
  const controller = new AbortController();
  process.once("SIGTERM", () => controller.abort());
  process.once("SIGINT", () => controller.abort());
  const configured = Number(process.env.INGESTION_POLL_SECONDS || 60);
  const poll = Number.isFinite(configured)
    ? Math.min(3600, Math.max(5, configured))
    : 60;
  console.log(`Agent Atlas 采集进程已启动；每 ${poll} 秒检查到期来源。`);
  try {
    while (!controller.signal.aborted) {
      try {
        console.log(
          JSON.stringify({
            at: new Date().toISOString(),
            ...(await syncSources({ signal: controller.signal })),
          }),
        );
      } catch (error) {
        console.error(error instanceof Error ? error.message : "调度失败");
      }
      if (controller.signal.aborted) break;
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          controller.signal.removeEventListener("abort", finish);
          resolve();
        };
        const timer = setTimeout(finish, poll * 1000);
        controller.signal.addEventListener("abort", finish, { once: true });
      });
    }
  } finally {
    await prisma.$disconnect();
    console.log("采集进程已停止。");
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "采集进程失败");
  process.exitCode = 1;
});
