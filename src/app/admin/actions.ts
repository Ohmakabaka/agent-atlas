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
  const path = `/admin/articles/${encodeURIComponent(id)}`;
  let failure = "";
  try {
    const values = z
      .object({
        title: z.string().min(1, "请填写中文标题").max(300),
        originalTitle: z.string().min(1, "请填写原始标题").max(500),
        url: webUrl,
        summary: z.string().max(30000),
        audience: z.string().max(1000),
        authorName: z.string().max(300),
        type: z.enum(["paper", "article", "docs", "repository", "podcast"]),
        layer: z.enum(["primary", "community", "engineering"]),
        language: z.enum(["zh", "en", "multilingual"]),
        quality: z.enum(["curated", "standard"]),
        status: z.enum([
          "discovered",
          "pending_review",
          "published",
          "archived",
        ]),
      })
      .parse(
        Object.fromEntries(
          [
            "title",
            "originalTitle",
            "url",
            "summary",
            "audience",
            "authorName",
            "type",
            "layer",
            "language",
            "quality",
            "status",
          ].map((k) => [k, text(form, k)]),
        ),
      );
    const topics = [...new Set(form.getAll("topics").map(String))];
    const existing = await prisma.article.findUniqueOrThrow({ where: { id } });
    if (topics.length > 80) throw new Error("主题数量超出限制");
    if (
      (await prisma.topic.count({ where: { id: { in: topics } } })) !==
      topics.length
    )
      throw new Error("部分主题已不存在，请刷新后重试");
    if (values.status === "published") {
      if (values.summary.length < 20 || !/\p{Script=Han}/u.test(values.summary))
        throw new Error("发布前请撰写至少 20 字的中文导读");
      if (!/\p{Script=Han}/u.test(values.title))
        throw new Error("发布前请填写中文标题");
      if (!topics.length) throw new Error("发布前请至少关联一个技术主题");
    }
    const date = text(form, "publishedAt");
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new Error("发布日期格式不正确");
    const publishedAt = date ? new Date(`${date}T00:00:00Z`) : null;
    if (
      publishedAt &&
      (Number.isNaN(publishedAt.getTime()) ||
        publishedAt.toISOString().slice(0, 10) !== date)
    )
      throw new Error("发布日期无效");
    const sourceId = text(form, "sourceId") || null;
    const source = sourceId
      ? await prisma.source.findUniqueOrThrow({ where: { id: sourceId } })
      : null;
    await prisma.$transaction(async (tx) => {
      await tx.articleTopic.deleteMany({ where: { articleId: id } });
      await tx.article.update({
        where: { id },
        data: {
          ...values,
          publishedAt,
          sourceId,
          organizationId: source?.organizationId ?? null,
          // canonical identity remains the ingestion identity; URL corrections retain old provenance.
          takeaways: text(form, "takeaways")
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 30),
          reviewedAt:
            values.status === "published" ? new Date() : existing.reviewedAt,
          topics: { create: topics.map((topicId) => ({ topicId })) },
        },
      });
      if (values.url !== existing.url) {
        const link = await tx.articleLink.findUnique({
          where: { url: values.url },
        });
        if (link && link.articleId !== id)
          throw new Error("该链接已属于另一篇内容，请先处理重复条目");
        if (!link)
          await tx.articleLink.create({
            data: { articleId: id, url: values.url, label: "人工修订链接" },
          });
      }
    });
  } catch (error) {
    failure = safeMessage(error);
  }
  finish(
    path,
    failure || "内容已保存。已发布的修改已同步到公开页面。",
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
    };
    const id = text(form, "id");
    if (id) await prisma.source.update({ where: { id }, data });
    else await prisma.source.create({ data });
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
    if (id) await prisma.relation.update({ where: { id }, data });
    else await prisma.relation.create({ data });
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
    await prisma.relation.delete({ where: { id: text(form, "id") } });
  } catch (error) {
    failure = safeMessage(error);
  }
  finish("/admin/relations", failure || "关联已删除。", !!failure);
}
