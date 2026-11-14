import { Prisma, type PrismaClient } from "@prisma/client";
import {
  EDITORIAL_AUTHOR,
  EDITORIAL_REPOSITORY,
  editorialOriginalUrl,
  editorialPackSchema,
} from "./schema";

export interface EditorialImportOptions {
  publish?: boolean;
  dryRun?: boolean;
}

/** Atomic, append-only import. Existing articles are never silently revised. */
export async function importEditorialPack(
  db: PrismaClient,
  input: unknown,
  options: EditorialImportOptions = {},
) {
  const entries = editorialPackSchema.parse(input);
  if (!entries.length)
    return {
      created: [] as string[],
      skipped: [] as string[],
      dryRun: !!options.dryRun,
    };
  return db.$transaction(
    async (tx) => {
      const requestedTopics = [
        ...new Set(entries.flatMap((entry) => entry.topics)),
      ];
      const topics = await tx.topic.findMany({
        where: { slug: { in: requestedTopics } },
        select: { slug: true },
      });
      const knownTopics = new Set(topics.map((topic) => topic.slug));
      const missingTopics = requestedTopics.filter(
        (topic) => !knownTopics.has(topic),
      );
      if (missingTopics.length)
        throw new Error(`内容包引用不存在的主题：${missingTopics.join("、")}`);
      const urls = entries.map((entry) => editorialOriginalUrl(entry.slug));
      const existing = await tx.article.findMany({
        where: {
          OR: [
            { slug: { in: entries.map((entry) => entry.slug) } },
            { canonicalUrl: { in: urls } },
            { links: { some: { url: { in: urls } } } },
          ],
        },
        select: {
          id: true,
          slug: true,
          canonicalUrl: true,
          links: { select: { url: true } },
        },
      });
      const skipped: string[] = [];
      for (const entry of entries) {
        const url = editorialOriginalUrl(entry.slug);
        const matches = existing.filter(
          (article) =>
            article.slug === entry.slug ||
            article.canonicalUrl === url ||
            article.links.some((link) => link.url === url),
        );
        if (
          matches.some(
            (article) =>
              article.slug !== entry.slug || article.canonicalUrl !== url,
          )
        )
          throw new Error(`文章标识或原文地址已属于其他内容：${entry.slug}`);
        if (matches.length) skipped.push(entry.slug);
      }
      const incoming = entries.filter((entry) => !skipped.includes(entry.slug));
      const created = incoming.map((entry) => entry.slug);
      if (options.dryRun || !incoming.length)
        return { created, skipped, dryRun: !!options.dryRun };

      const organization = await tx.organization.upsert({
        where: { slug: "agent-atlas" },
        update: {},
        create: {
          id: "org-agent-atlas",
          slug: "agent-atlas",
          name: "Agent Atlas",
          url: EDITORIAL_REPOSITORY,
        },
      });
      const source = await tx.source.upsert({
        where: { url: EDITORIAL_REPOSITORY },
        update: {},
        create: {
          id: "source-agent-atlas",
          slug: "agent-atlas-originals",
          name: "Agent Atlas 原创指南",
          type: "community",
          platform: "web",
          url: EDITORIAL_REPOSITORY,
          description:
            "使用当前 Codex 会话辅助撰写的中文技术指南，保留原始参考资料与来源核查日期。",
          organizationId: organization.id,
          enabled: false,
        },
      });
      for (const entry of incoming) {
        const url = editorialOriginalUrl(entry.slug);
        const article = await tx.article.create({
          data: {
            id: `article-${entry.slug}`,
            slug: entry.slug,
            title: entry.title,
            originalTitle: entry.title,
            summary: entry.summary,
            bodyMarkdown: entry.bodyMarkdown,
            takeaways: entry.takeaways,
            audience: entry.audience,
            url,
            canonicalUrl: url,
            authorName: EDITORIAL_AUTHOR,
            type: "article",
            layer: "community",
            language: "zh",
            quality: "standard",
            status: options.publish ? "published" : "pending_review",
            publishedAt: options.publish ? new Date() : null,
            reviewedAt: null,
            sourceId: source.id,
            organizationId: organization.id,
            rawMetadata: {
              origin: "codex_session",
              verifiedAt: entry.verifiedAt,
              references: entry.references,
              provenance:
                "Codex 会话辅助撰写，已核对列出来源；未声明人工审核。",
            },
            aiDraft: JSON.parse(JSON.stringify(entry)) as Prisma.InputJsonValue,
            topics: {
              create: entry.topics.map((slug) => ({
                topic: { connect: { slug } },
              })),
            },
            links: { create: { url, label: "本站指南 Markdown 原稿" } },
          },
        });
        await tx.auditLog.create({
          data: {
            action: "content.import",
            entityType: "article",
            entityId: article.id,
            detail: {
              origin: "codex_session",
              status: article.status,
              verifiedAt: entry.verifiedAt,
            },
          },
        });
      }
      return { created, skipped, dryRun: false };
    },
    { timeout: 30000 },
  );
}
