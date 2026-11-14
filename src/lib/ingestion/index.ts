import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import {
  canonicalizeUrl,
  articleSlug,
  normalizeTitle,
  validDate,
} from "./normalize";
import { validatePublicUrl } from "./network";
import {
  githubAdapter,
  parseBatch,
  urlAdapter,
  wechatAdapter,
  type DiscoveredItem,
  type ImportMetadata,
} from "./adapters";
import { suggestTopics } from "./classify";
export type { SourceAdapter, DiscoveredItem, ImportMetadata } from "./adapters";
export { canonicalizeUrl } from "./normalize";

export interface ImportResult {
  articleId: string;
  slug: string;
  duplicate: boolean;
  warning?: string;
}
const asJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const message = (error: unknown) =>
  error instanceof Error ? error.message.slice(0, 400) : "采集失败";

async function sourceFor(item: DiscoveredItem) {
  if (item.sourceId) {
    const source = await prisma.source.findUnique({
      where: { id: item.sourceId },
    });
    if (!source) throw new Error("所选来源不存在");
    return source;
  }
  const url = new URL(item.url);
  const sources = await prisma.source.findMany();
  // More specific source paths win over host-wide catalog entries. A path
  // segment boundary prevents /news from matching unrelated /newsletter URLs.
  const existing = sources
    .flatMap((source) => {
      try {
        const candidate = new URL(source.url);
        if (
          candidate.hostname.replace(/^www\./, "") !==
          url.hostname.replace(/^www\./, "")
        )
          return [];
        const path = candidate.pathname.replace(/\/+$/, "") || "/";
        if (
          path !== "/" &&
          url.pathname !== path &&
          !url.pathname.startsWith(`${path}/`)
        )
          return [];
        return [{ source, specificity: path.length }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.specificity - a.specificity)[0]?.source;
  if (existing) return existing;
  return prisma.source.upsert({
    where: { url: url.origin },
    update: {},
    create: {
      slug: `web-${url.hostname.replace(/[^a-z0-9]+/g, "-")}`,
      name: item.sourceName || url.hostname,
      url: url.origin,
      type: item.adapter === "wechat" ? "community" : "website",
      platform:
        item.adapter === "wechat"
          ? "wechat"
          : item.adapter === "github"
            ? "github"
            : "web",
      description: "由编辑导入创建，来源信息待维护。",
    },
  });
}

export async function ingestItem(item: DiscoveredItem): Promise<ImportResult> {
  const url = canonicalizeUrl(item.url);
  const canonicalUrl = canonicalizeUrl(item.canonicalUrl || item.url);
  const source = await sourceFor(item);
  const originalTitle = (
    item.originalTitle ||
    item.title ||
    new URL(url).hostname + new URL(url).pathname
  )
    .trim()
    .slice(0, 500);
  const publishedAt = validDate(item.publishedAt);
  const candidates = await prisma.article.findMany({
    where: {
      OR: [
        { canonicalUrl: { in: [url, canonicalUrl] } },
        { links: { some: { url: { in: [url, canonicalUrl] } } } },
      ],
    },
  });
  if (candidates.length > 1)
    throw new Error("收录链接与规范链接分别属于不同内容，请人工核对后再合并");
  let existing = candidates[0];
  // Title matches are not enough on their own: require same source, date and a substantial exact title.
  if (!existing && publishedAt && normalizeTitle(originalTitle).length >= 24) {
    const day = new Date(publishedAt.toISOString().slice(0, 10));
    const nextDay = new Date(day.getTime() + 86_400_000);
    const sameDay = await prisma.article.findMany({
      where: { sourceId: source.id, publishedAt: { gte: day, lt: nextDay } },
    });
    existing = sameDay.find(
      (article) =>
        normalizeTitle(article.originalTitle) === normalizeTitle(originalTitle),
    )!;
  }
  if (existing) {
    for (const link of [...new Set([url, canonicalUrl])])
      await prisma.articleLink.upsert({
        where: { url: link },
        update: {},
        create: { articleId: existing.id, url: link, label: "补充来源链接" },
      });
    return { articleId: existing.id, slug: existing.slug, duplicate: true };
  }
  const topics = await prisma.topic.findMany({
    select: { id: true, slug: true, name: true, englishName: true },
  });
  const suggestions = suggestTopics(
    [originalTitle, item.description, item.summary].filter(Boolean).join("\n"),
    topics,
  );
  let article;
  try {
    article = await prisma.article.create({
      data: {
        slug: articleSlug(originalTitle, canonicalUrl),
        title: (item.title || originalTitle).slice(0, 500),
        originalTitle,
        url,
        canonicalUrl,
        sourceId: source.id,
        organizationId: source.organizationId,
        authorName: item.authorName?.slice(0, 200) || "",
        publishedAt,
        type: ["paper", "article", "docs", "repository", "podcast"].includes(
          item.type || "",
        )
          ? item.type
          : "article",
        layer: ["primary", "community", "engineering"].includes(
          item.layer || "",
        )
          ? item.layer
          : item.adapter === "wechat"
            ? "community"
            : "primary",
        language: item.language === "zh" ? "zh" : "en",
        status: "pending_review",
        quality: "standard",
        summary: item.summary?.slice(0, 20_000) || "",
        rawMetadata: asJson({
          ...item,
          discoveredAt: new Date().toISOString(),
          fullTextStored: false,
        }),
        aiDraft: asJson({
          provider: "heuristic",
          topicSuggestions: suggestions,
          titleSuggestion: null,
          summaryDraft: null,
          note: "规则推荐，尚未经人工审核。",
        }),
        links: {
          create: [...new Set([url, canonicalUrl])].map((link) => ({
            url: link,
            label: link === canonicalUrl ? "规范链接" : "收录链接",
          })),
        },
        outgoing: {
          create: suggestions.map((topic) => ({
            type: "related_to",
            status: "suggested",
            toTopicId: topic.id,
            description: `关键词建议：${topic.matched.join("、")}；需人工核对。`,
          })),
        },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const concurrent = await prisma.article.findUnique({
        where: { canonicalUrl },
      });
      if (concurrent) return ingestItem(item);
    }
    throw error;
  }
  return { articleId: article.id, slug: article.slug, duplicate: false };
}

export async function importUrl(
  input: string,
  metadata: ImportMetadata = {},
): Promise<ImportResult> {
  const url = validatePublicUrl(input);
  const adapter =
    url.hostname === "mp.weixin.qq.com"
      ? wechatAdapter
      : url.hostname === "github.com" &&
          url.pathname.split("/").filter(Boolean).length === 2
        ? githubAdapter
        : urlAdapter;
  const job = await prisma.ingestionJob.create({
    data: {
      adapter: adapter.name,
      details: asJson({ url: url.href, metadata }),
    },
  });
  try {
    let item: DiscoveredItem;
    let warning: string | undefined;
    try {
      [item] = await adapter.discover(url.href);
    } catch (error) {
      warning = `未获取网页元数据，已保留链接供人工编辑：${message(error)}`;
      item = {
        url: url.href,
        adapter: adapter.name,
        type: adapter === githubAdapter ? "repository" : "article",
      };
    }
    const result = await ingestItem({ ...item, ...metadata, url: url.href });
    await prisma.ingestionJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        finishedAt: new Date(),
        imported: result.duplicate ? 0 : 1,
        duplicates: result.duplicate ? 1 : 0,
        details: asJson({
          url: url.href,
          metadata,
          warning: warning || null,
          articleId: result.articleId,
        }),
      },
    });
    return { ...result, warning };
  } catch (error) {
    await prisma.ingestionJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        failed: 1,
        error: message(error),
      },
    });
    throw error;
  }
}

export async function importBatch(text: string, format: "json" | "csv") {
  const items = parseBatch(text, format);
  const job = await prisma.ingestionJob.create({ data: { adapter: format } });
  const result: {
    imported: number;
    duplicates: number;
    errors: Array<{ row: number; message: string }>;
  } = { imported: 0, duplicates: 0, errors: [] };
  for (const [index, item] of items.entries()) {
    try {
      const entry = await ingestItem(item);
      if (entry.duplicate) result.duplicates++;
      else result.imported++;
    } catch (error) {
      result.errors.push({ row: index + 1, message: message(error) });
    }
  }
  await prisma.ingestionJob.update({
    where: { id: job.id },
    data: {
      status: result.errors.length ? "completed_with_errors" : "completed",
      finishedAt: new Date(),
      imported: result.imported,
      duplicates: result.duplicates,
      failed: result.errors.length,
      details: asJson({ errors: result.errors }),
    },
  });
  return result;
}

export { syncSources } from "./scheduler";
