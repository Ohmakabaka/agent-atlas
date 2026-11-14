import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";

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
  }, "仅允许不含凭据的 HTTP / HTTPS 链接");
const optionalId = z.string().max(200).nullable();
const caseSchema = z.object({
  problem: z.string().min(1, "请填写工程问题").max(5000),
  architecture: z.string().min(1, "请填写架构说明").max(5000),
  solution: z.string().min(1, "请填写解决方案").max(10000),
  outcome: z.string().min(1, "请填写效果与局限，未知时明确注明").max(5000),
  evidenceUrl: webUrl,
});
export const articleInputSchema = z.object({
  title: z.string().trim().min(1, "请填写中文标题").max(300),
  originalTitle: z.string().trim().min(1, "请填写原始标题").max(500),
  url: webUrl,
  summary: z.string().max(30000),
  audience: z.string().max(1000),
  authorName: z.string().max(300),
  type: z.enum(["paper", "article", "docs", "repository", "podcast"]),
  layer: z.enum(["primary", "community", "engineering"]),
  language: z.enum(["zh", "en", "multilingual"]),
  quality: z.enum(["curated", "standard"]),
  status: z.enum(["discovered", "pending_review", "published", "archived"]),
  publishedAt: z
    .string()
    .nullable()
    .refine((value) => {
      if (value === null) return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const d = new Date(`${value}T00:00:00Z`);
      return (
        !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
      );
    }, "发布日期无效"),
  sourceId: optionalId,
  organizationId: optionalId,
  takeaways: z.array(z.string().max(2000)).max(30),
  topicIds: z.array(z.string()).max(80),
  personIds: z.array(z.string()).max(30),
  engineeringCase: caseSchema.nullable(),
});
export type ArticleInput = z.infer<typeof articleInputSchema>;
const historyInclude = {
  topics: true,
  people: true,
  engineeringCase: true,
} satisfies Prisma.ArticleInclude;
type EditableArticle = Prisma.ArticleGetPayload<{
  include: typeof historyInclude;
}>;
export function articleSnapshot(article: EditableArticle) {
  return {
    title: article.title,
    originalTitle: article.originalTitle,
    url: article.url,
    summary: article.summary,
    audience: article.audience,
    authorName: article.authorName,
    type: article.type,
    layer: article.layer,
    language: article.language,
    quality: article.quality,
    status: article.status,
    publishedAt: article.publishedAt?.toISOString().slice(0, 10) ?? null,
    sourceId: article.sourceId,
    organizationId: article.organizationId,
    takeaways: Array.isArray(article.takeaways)
      ? article.takeaways.filter((v): v is string => typeof v === "string")
      : [],
    topicIds: article.topics.map((t) => t.topicId),
    personIds: article.people.map((p) => p.personId),
    engineeringCase: article.engineeringCase
      ? {
          problem: article.engineeringCase.problem,
          architecture: article.engineeringCase.architecture,
          solution: article.engineeringCase.solution,
          outcome: article.engineeringCase.outcome,
          evidenceUrl: article.engineeringCase.evidenceUrl,
        }
      : null,
  };
}
export function parseArticleForm(form: FormData): ArticleInput {
  const get = (key: string) => String(form.get(key) ?? "").trim();
  const fields = [
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
  ];
  return articleInputSchema.parse({
    ...Object.fromEntries(fields.map((key) => [key, get(key)])),
    publishedAt: get("publishedAt") || null,
    sourceId: get("sourceId") || null,
    organizationId: get("organizationId") || null,
    takeaways: get("takeaways")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    topicIds: [...new Set(form.getAll("topics").map(String))],
    personIds: [...new Set(form.getAll("people").map(String))],
    engineeringCase:
      form.get("hasEngineeringCase") === "on"
        ? Object.fromEntries(
            [
              "problem",
              "architecture",
              "solution",
              "outcome",
              "evidenceUrl",
            ].map((key) => [key, get(`case_${key}`)]),
          )
        : null,
  });
}
const conflict =
  "这篇资料已被另一个编辑窗口修改。请刷新并对照版本历史后重新保存；你的修改没有覆盖新版本。";
async function applyEdit(
  tx: Prisma.TransactionClient,
  id: string,
  expectedVersion: number,
  input: ArticleInput,
  reason: string,
) {
  const current = await tx.article.findUnique({
    where: { id },
    include: historyInclude,
  });
  if (!current) throw new Error("内容不存在或已被删除");
  if (current.version !== expectedVersion) throw new Error(conflict);
  const values = articleInputSchema.parse(input);
  if (values.status === "published") {
    if (!/\p{Script=Han}/u.test(values.title))
      throw new Error("发布前请填写中文标题");
    if (values.summary.length < 20 || !/\p{Script=Han}/u.test(values.summary))
      throw new Error("发布前请撰写至少20字的中文导读");
    if (!values.topicIds.length)
      throw new Error("发布前请至少关联一个技术主题");
  }
  const topicIds = [...new Set(values.topicIds)],
    personIds = [...new Set(values.personIds)];
  if (
    (await tx.topic.count({ where: { id: { in: topicIds } } })) !==
    topicIds.length
  )
    throw new Error("部分主题已不存在，请刷新后重试");
  if (
    (await tx.person.count({ where: { id: { in: personIds } } })) !==
    personIds.length
  )
    throw new Error("部分人物已不存在，请刷新后重试");
  if (
    values.sourceId &&
    !(await tx.source.findUnique({ where: { id: values.sourceId } }))
  )
    throw new Error("所选来源不存在");
  if (
    values.organizationId &&
    !(await tx.organization.findUnique({
      where: { id: values.organizationId },
    }))
  )
    throw new Error("所选机构不存在");
  const knownLink = await tx.articleLink.findUnique({
    where: { url: values.url },
  });
  const knownCanonical = await tx.article.findUnique({
    where: { canonicalUrl: values.url },
  });
  if (
    (knownLink && knownLink.articleId !== id) ||
    (knownCanonical && knownCanonical.id !== id)
  )
    throw new Error("该链接已属于另一篇内容，请先核对重复条目");
  const {
    topicIds: _topics,
    personIds: _people,
    engineeringCase,
    publishedAt,
    ...data
  } = values;
  const update = await tx.article.updateMany({
    where: { id, version: expectedVersion },
    data: {
      ...data,
      publishedAt: publishedAt ? new Date(`${publishedAt}T00:00:00Z`) : null,
      version: { increment: 1 },
      reviewedAt:
        values.status === "published" ? new Date() : current.reviewedAt,
    },
  });
  if (update.count !== 1) throw new Error(conflict);
  await tx.articleRevision.create({
    data: {
      articleId: id,
      version: current.version,
      snapshot: articleSnapshot(current),
      reason,
    },
  });
  await tx.articleTopic.deleteMany({ where: { articleId: id } });
  if (topicIds.length)
    await tx.articleTopic.createMany({
      data: topicIds.map((topicId) => ({ articleId: id, topicId })),
    });
  await tx.articlePerson.deleteMany({ where: { articleId: id } });
  if (personIds.length)
    await tx.articlePerson.createMany({
      data: personIds.map((personId) => ({ articleId: id, personId })),
    });
  if (engineeringCase)
    await tx.engineeringCase.upsert({
      where: { articleId: id },
      create: { articleId: id, ...engineeringCase },
      update: engineeringCase,
    });
  else await tx.engineeringCase.deleteMany({ where: { articleId: id } });
  if (!knownLink)
    await tx.articleLink.create({
      data: { articleId: id, url: values.url, label: "人工修订链接" },
    });
  await tx.auditLog.create({
    data: {
      action: reason.startsWith("restore:")
        ? "article.restore"
        : reason.startsWith("reject:")
          ? "article.reject"
          : "article.save",
      entityType: "article",
      entityId: id,
      detail: {
        fromVersion: current.version,
        toVersion: current.version + 1,
        fromStatus: current.status,
        toStatus: values.status,
        reason,
      },
    },
  });
  return { version: current.version + 1, status: values.status };
}
export async function editArticle(
  id: string,
  expectedVersion: number,
  input: ArticleInput,
  reason = "edit",
) {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
    throw new Error("内容版本无效，请刷新编辑页");
  return prisma.$transaction((tx) =>
    applyEdit(tx, id, expectedVersion, input, reason.slice(0, 1000)),
  );
}
export async function restoreArticle(
  id: string,
  expectedVersion: number,
  revisionId: string,
) {
  return prisma.$transaction(async (tx) => {
    const revision = await tx.articleRevision.findFirst({
      where: { id: revisionId, articleId: id },
    });
    if (!revision) throw new Error("历史版本不存在");
    const snapshot = articleInputSchema.parse(revision.snapshot);
    return applyEdit(
      tx,
      id,
      expectedVersion,
      { ...snapshot, status: "pending_review" },
      `restore:${revision.version}`,
    );
  });
}
export async function rejectArticleReview(
  id: string,
  expectedVersion: number,
  reason: string,
) {
  if (reason.trim().length < 5 || reason.length > 1000)
    throw new Error("请填写5至1000字的驳回原因");
  return prisma.$transaction(async (tx) => {
    const current = await tx.article.findUniqueOrThrow({
      where: { id },
      include: historyInclude,
    });
    return applyEdit(
      tx,
      id,
      expectedVersion,
      articleInputSchema.parse({
        ...articleSnapshot(current),
        status: "archived",
      }),
      `reject:${reason.trim()}`,
    );
  });
}
export function snapshotDifference(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}
