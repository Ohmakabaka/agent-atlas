"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

const webUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  }, "只允许不含用户名和密码的 HTTP / HTTPS 地址");
const optionalUrl = z.union([webUrl, z.literal("")]);
const text = (form: FormData, name: string) =>
  String(form.get(name) ?? "").trim();
const safeMessage = (error: unknown) =>
  error instanceof z.ZodError
    ? error.issues.map((i) => i.message).join("；")
    : error instanceof Error && !/prisma|SQLITE|invocation/i.test(error.message)
      ? error.message.slice(0, 250)
      : "保存失败，请检查字段、链接是否重复，以及所选记录是否仍然存在。";
function finish(path: string, message: string, error = false): never {
  revalidatePath("/", "layout");
  redirect(
    `${path}?${error ? "error" : "notice"}=${encodeURIComponent(message)}`,
  );
}

export async function saveArticle(form: FormData) {
  await requireAuth();
  const id = text(form, "id");
  let failure = "";
  try {
    const { editArticle, parseArticleForm } = await import(
      "@/lib/editor/articles"
    );
    await editArticle(
      id,
      Number(text(form, "version")),
      parseArticleForm(form),
      text(form, "revisionNote") || "edit",
    );
  } catch (error) {
    failure = safeMessage(error);
  }
  finish(
    `/admin/articles/${encodeURIComponent(id)}`,
    failure || "内容已保存。版本历史已记录，已发布内容的修改已同步。",
    !!failure,
  );
}
export async function saveArticleWithFeedback(
  form: FormData,
): Promise<{ error?: string; location?: string }> {
  await requireAuth();
  const id = text(form, "id");
  try {
    const { editArticle, parseArticleForm } = await import(
      "@/lib/editor/articles"
    );
    await editArticle(
      id,
      Number(text(form, "version")),
      parseArticleForm(form),
      text(form, "revisionNote") || "edit",
    );
  } catch (error) {
    return { error: safeMessage(error) };
  }
  revalidatePath("/", "layout");
  return {
    location: `/admin/articles/${encodeURIComponent(id)}?notice=${encodeURIComponent("内容已保存。版本历史已记录，已发布内容的修改已同步。")}`,
  };
}
export async function restoreArticleVersion(form: FormData) {
  await requireAuth();
  const id = text(form, "id");
  let failure = "";
  try {
    const { restoreArticle } = await import("@/lib/editor/articles");
    await restoreArticle(
      id,
      Number(text(form, "version")),
      text(form, "revisionId"),
    );
  } catch (error) {
    failure = safeMessage(error);
  }
  finish(
    `/admin/articles/${encodeURIComponent(id)}`,
    failure || "历史内容已恢复为待审核，新版本已保留。请重新核对后发布。",
    !!failure,
  );
}
export async function rejectArticle(form: FormData) {
  await requireAuth();
  const id = text(form, "id");
  let failure = "";
  try {
    const { rejectArticleReview } = await import("@/lib/editor/articles");
    await rejectArticleReview(
      id,
      Number(text(form, "version")),
      text(form, "reason"),
    );
  } catch (error) {
    failure = safeMessage(error);
  }
  finish(
    `/admin/articles/${encodeURIComponent(id)}`,
    failure || "资料已驳回并归档，原因与原版本已保存。",
    !!failure,
  );
}

export async function importArticle(form: FormData) {
  await requireAuth();
  let failure = "",
    target = "",
    notice = "";
  try {
    const url = webUrl.parse(text(form, "url"));
    const { importUrl } = await import("@/lib/ingestion");
    const result = await importUrl(url, {
      title: text(form, "title") || undefined,
      sourceId: text(form, "sourceId") || undefined,
      summary: text(form, "summary") || undefined,
    });
    target = `/admin/articles/${encodeURIComponent(result.articleId)}`;
    notice = result.duplicate
      ? "已找到重复条目，保留已有内容并关联来源链接。"
      : "已收录为待审核内容，请补全导读与主题后发布。";
    if (result.warning) notice += ` ${result.warning}`;
  } catch (error) {
    failure = safeMessage(error);
  }
  finish(failure ? "/admin/import" : target, failure || notice, !!failure);
}

export async function batchImport(form: FormData) {
  await requireAuth();
  let failure = "",
    message = "";
  try {
    const format = z.enum(["json", "csv"]).parse(text(form, "format"));
    const input = z
      .string()
      .min(2)
      .max(1_000_000, "单次导入文件不能超过 1 MB")
      .parse(text(form, "content"));
    const { importBatch } = await import("@/lib/ingestion");
    const result = await importBatch(input, format);
    message = `导入完成：新增 ${result.imported} 条，重复 ${result.duplicates} 条，失败 ${result.errors.length} 条。`;
    if (result.errors.length)
      message += result.errors
        .slice(0, 3)
        .map((e) => `第 ${e.row} 行：${e.message}`)
        .join("；");
  } catch (error) {
    failure = safeMessage(error);
  }
  finish("/admin/import", failure || message, !!failure);
}

export async function requestDraft(form: FormData) {
  await requireAuth();
  const id = text(form, "id");
  let message = "",
    failure = "";
  try {
    await prisma.article.findUniqueOrThrow({ where: { id } });
    const { generateDraft } = await import("@/lib/ai");
    const result = await generateDraft(id);
    message = result.message;
  } catch (error) {
    failure = safeMessage(error);
  }
  finish(
    `/admin/articles/${encodeURIComponent(id)}`,
    failure || message,
    !!failure,
  );
}

export async function saveSource(form: FormData) {
  await requireAuth();
  let failure = "";
  try {
    const values = z
      .object({
        name: z.string().min(1).max(200),
        slug: z
          .string()
          .regex(/^[a-z0-9-]+$/, "标识只能使用小写字母、数字和短横线")
          .max(100),
        url: webUrl,
        feedUrl: optionalUrl,
        type: z.string().min(1).max(50),
        platform: z.string().min(1).max(50),
        description: z.string().max(3000),
      })
      .parse(
        Object.fromEntries(
          [
            "name",
            "slug",
            "url",
            "feedUrl",
            "type",
            "platform",
            "description",
          ].map((k) => [k, text(form, k)]),
        ),
      );
    const data = {
      ...values,
      feedUrl: values.feedUrl || null,
      enabled: form.get("enabled") === "on",
      organizationId: text(form, "organizationId") || null,
      syncIntervalMinutes: z.coerce
        .number()
        .int()
        .min(1, "检查间隔至少1分钟")
        .max(10080, "检查间隔最多10080分钟")
        .parse(text(form, "syncIntervalMinutes") || "60"),
    };
    const id = text(form, "id");
    await prisma.$transaction(async (tx) => {
      const previous = id
        ? await tx.source.findUniqueOrThrow({ where: { id } })
        : null;
      const resetFeedState =
        previous && previous.feedUrl !== data.feedUrl
          ? {
              etag: null,
              lastModified: null,
              lastCheckedAt: null,
              lastSuccessAt: null,
              lastError: null,
            }
          : {};
      const saved = id
        ? await tx.source.update({
            where: { id },
            data: { ...data, ...resetFeedState },
          })
        : await tx.source.create({ data });
      await tx.auditLog.create({
        data: {
          action: id ? "source.update" : "source.create",
          entityType: "source",
          entityId: saved.id,
          detail: { name: saved.name, enabled: saved.enabled },
        },
      });
    });
  } catch (error) {
    failure = safeMessage(error);
  }
  finish("/admin/sources", failure || "来源已保存。", !!failure);
}

export async function runSync() {
  await requireAuth();
  let failure = "",
    message = "";
  try {
    const { syncSources } = await import("@/lib/ingestion");
    const result = await syncSources();
    message = `检查 ${result.sources} 个来源，新增 ${result.imported} 条，重复 ${result.duplicates} 条，失败 ${result.errors.length} 个来源。`;
  } catch (error) {
    failure = safeMessage(error);
  }
  finish("/admin/jobs", failure || message, !!failure);
}

export async function saveRelation(form: FormData) {
  await requireAuth();
  let failure = "";
  try {
    const type = z
      .enum([
        "explains",
        "implements",
        "discusses",
        "compares_with",
        "references",
        "extends",
        "challenges",
        "related_to",
        "prerequisite_for",
        "evolves_from",
      ])
      .parse(text(form, "type"));
    const status = z
      .enum(["suggested", "confirmed"])
      .parse(text(form, "status"));
    const evidenceUrl = optionalUrl.parse(text(form, "evidenceUrl")) || null;
    const description = z.string().max(3000).parse(text(form, "description"));
    if (status === "confirmed" && !evidenceUrl)
      throw new Error("确认关系需要填写能支持该关系的依据链接");
    const endpoint = async (value: string) => {
      const [kind, id, ...rest] = value.split(":");
      if (!id || rest.length || !["article", "topic"].includes(kind))
        throw new Error("请选择关系两端的内容或主题");
      if (kind === "article")
        await prisma.article.findUniqueOrThrow({ where: { id } });
      else await prisma.topic.findUniqueOrThrow({ where: { id } });
      return { kind, id };
    };
    const from = await endpoint(text(form, "from")),
      to = await endpoint(text(form, "to"));
    if (from.kind === to.kind && from.id === to.id)
      throw new Error("关系两端不能相同");
    const data = {
      type,
      status,
      evidenceUrl,
      description,
      fromArticleId: from.kind === "article" ? from.id : null,
      fromTopicId: from.kind === "topic" ? from.id : null,
      toArticleId: to.kind === "article" ? to.id : null,
      toTopicId: to.kind === "topic" ? to.id : null,
    };
    const id = text(form, "id");
    await prisma.$transaction(async (tx) => {
      const saved = id
        ? await tx.relation.update({ where: { id }, data })
        : await tx.relation.create({ data });
      await tx.auditLog.create({
        data: {
          action: id ? "relation.update" : "relation.create",
          entityType: "relation",
          entityId: saved.id,
          detail: {
            type: saved.type,
            status: saved.status,
            from: text(form, "from"),
            to: text(form, "to"),
          },
        },
      });
    });
  } catch (error) {
    failure = safeMessage(error);
  }
  finish(
    "/admin/relations",
    failure || "知识关联已保存；仅已确认关系显示在公开页面。",
    !!failure,
  );
}

export async function deleteRelation(form: FormData) {
  await requireAuth();
  let failure = "";
  try {
    await prisma.$transaction(async (tx) => {
      const removed = await tx.relation.delete({
        where: { id: text(form, "id") },
      });
      await tx.auditLog.create({
        data: {
          action: "relation.delete",
          entityType: "relation",
          entityId: removed.id,
          detail: { type: removed.type, status: removed.status },
        },
      });
    });
  } catch (error) {
    failure = safeMessage(error);
  }
  finish("/admin/relations", failure || "关联已删除。", !!failure);
}
