"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { importUrl, syncSources, type ImportMetadata } from "@/lib/ingestion";

function finish(message: string, error = false): never {
  revalidatePath("/admin/jobs");
  revalidatePath("/admin");
  redirect(
    `/admin/jobs?${error ? "error" : "notice"}=${encodeURIComponent(message)}`,
  );
}
function summary(result: Awaited<ReturnType<typeof syncSources>>) {
  return `检查 ${result.sources} 个来源：新增 ${result.imported}，重复 ${result.duplicates}，未变更 ${result.notModified}，跳过 ${result.skipped}，错误 ${result.errors.length}。${result.errors
    .map((error) => `${error.source}：${error.message}`)
    .slice(0, 3)
    .join("；")}`;
}
export async function synchronize(form: FormData) {
  await requireAuth();
  let notice = "",
    failed = false;
  try {
    const sourceId = String(form.get("sourceId") || "").trim();
    const result = await syncSources({
      sourceId: sourceId || undefined,
      force: true,
    });
    notice = summary(result);
    failed = result.errors.length > 0;
  } catch (error) {
    failed = true;
    notice = error instanceof Error ? error.message : "同步失败";
  }
  finish(notice, failed);
}
export async function retryJob(form: FormData) {
  await requireAuth();
  let notice = "",
    failed = false;
  try {
    const id = String(form.get("id") || "");
    const job = await prisma.ingestionJob.findUniqueOrThrow({ where: { id } });
    if (job.sourceId) {
      const result = await syncSources({ sourceId: job.sourceId, force: true });
      notice = summary(result);
      failed = result.errors.length > 0;
    } else {
      const details =
        job.details &&
        typeof job.details === "object" &&
        !Array.isArray(job.details)
          ? job.details
          : {};
      if (typeof details.url !== "string")
        throw new Error(
          "该历史任务未保存重试参数，请重新提交原始链接或批量文件。",
        );
      const metadata: ImportMetadata = {};
      const raw = details.metadata;
      if (raw && typeof raw === "object" && !Array.isArray(raw))
        for (const key of [
          "title",
          "originalTitle",
          "summary",
          "authorName",
          "sourceId",
          "publishedAt",
          "language",
          "layer",
          "type",
          "canonicalUrl",
        ] as const)
          if (typeof raw[key] === "string") metadata[key] = raw[key];
      const result = await importUrl(details.url, metadata);
      notice = `${result.duplicate ? "已有内容已保留，未重复创建" : "已重新收录到待审核队列"}。${result.warning || ""}`;
    }
  } catch (error) {
    failed = true;
    notice =
      error instanceof Error && !error.message.includes("Prisma")
        ? error.message
        : "无法重试，请检查任务是否仍然存在。";
  }
  finish(notice, failed);
}
