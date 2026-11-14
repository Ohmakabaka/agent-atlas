import { Prisma } from "@prisma/client";
import { prisma } from "./db";

const publicRelationWhere: Prisma.RelationWhereInput = {
  status: "confirmed",
  AND: [
    { OR: [{ fromArticleId: null }, { fromArticle: { status: "published" } }] },
    { OR: [{ toArticleId: null }, { toArticle: { status: "published" } }] },
  ],
};

export const articleInclude = {
  source: true,
  organization: true,
  topics: { include: { topic: true } },
} satisfies Prisma.ArticleInclude;
export type ArticleWithRelations = Prisma.ArticleGetPayload<{
  include: typeof articleInclude;
}>;
export function parseStringList(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}
export async function getHomeData() {
  const [topics, featuredTopics, latest, engineering, sources, count] =
    await Promise.all([
      prisma.topic.findMany({
        where: { parentId: null },
        include: {
          children: {
            orderBy: { sortOrder: "asc" },
            include: {
              _count: {
                select: {
                  articles: { where: { article: { status: "published" } } },
                },
              },
            },
          },
          _count: {
            select: {
              articles: { where: { article: { status: "published" } } },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.topic.findMany({
        where: { featured: true },
        include: {
          _count: {
            select: {
              articles: { where: { article: { status: "published" } } },
            },
          },
        },
      }),
      prisma.article.findMany({
        where: { status: "published" },
        include: articleInclude,
        orderBy: { publishedAt: "desc" },
        take: 6,
      }),
      prisma.article.findMany({
        where: { status: "published", layer: "engineering" },
        include: articleInclude,
        orderBy: { updatedAt: "desc" },
        take: 3,
      }),
      prisma.source.findMany({
        include: {
          _count: { select: { articles: { where: { status: "published" } } } },
        },
      }),
      prisma.article.count({ where: { status: "published" } }),
    ]);
  return { topics, featuredTopics, latest, engineering, sources, count };
}
export async function getTopic(slug: string) {
  const topic = await prisma.topic.findUnique({
    where: { slug },
    include: {
      parent: true,
      children: { orderBy: { sortOrder: "asc" } },
      outgoing: {
        where: publicRelationWhere,
        include: { toTopic: true, toArticle: true },
      },
      incoming: {
        where: publicRelationWhere,
        include: { fromTopic: true, fromArticle: true },
      },
    },
  });
  if (!topic) return null;
  const topicIds = [topic.id, ...topic.children.map((t) => t.id)];
  const articles = await prisma.article.findMany({
    where: {
      status: "published",
      topics: { some: { topicId: { in: topicIds } } },
    },
    include: articleInclude,
    orderBy: { publishedAt: "desc" },
  });
  const pathSlugs = parseStringList(topic.readingPath);
  const readingPath = pathSlugs
    .map((slug) => articles.find((a) => a.slug === slug))
    .filter((a): a is ArticleWithRelations => !!a);
  return { ...topic, articles, readingPathArticles: readingPath };
}
export async function getArticle(slug: string) {
  const article = await prisma.article.findFirst({
    where: { slug, status: "published" },
    include: {
      ...articleInclude,
      links: true,
      people: { include: { person: true } },
      engineeringCase: true,
      outgoing: {
        where: publicRelationWhere,
        include: { toArticle: true, toTopic: true },
      },
      incoming: {
        where: publicRelationWhere,
        include: { fromArticle: true, fromTopic: true },
      },
    },
  });
  if (!article) return null;
  const related = await prisma.article.findMany({
    where: {
      id: { not: article.id },
      status: "published",
      topics: {
        some: { topicId: { in: article.topics.map((t) => t.topicId) } },
      },
    },
    include: articleInclude,
    take: 4,
    orderBy: { publishedAt: "desc" },
  });
  return { ...article, related };
}
export type SearchFilters = {
  q?: string;
  topic?: string;
  source?: string;
  organization?: string;
  platform?: string;
  type?: string;
  layer?: string;
  language?: string;
  quality?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
};
function validDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
    ? undefined
    : date;
}
function boundedInteger(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(1, Math.floor(parsed)))
    : fallback;
}
export async function searchArticles(filters: SearchFilters = {}) {
  const q = filters.q?.trim().slice(0, 200);
  const where: Prisma.ArticleWhereInput = { status: "published" };
  if (q)
    where.AND = q
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => ({
        OR: [
          { title: { contains: term } },
          { originalTitle: { contains: term } },
          { summary: { contains: term } },
          { authorName: { contains: term } },
          {
            topics: {
              some: {
                topic: {
                  OR: [
                    { name: { contains: term } },
                    { englishName: { contains: term } },
                  ],
                },
              },
            },
          },
        ],
      }));
  if (filters.topic)
    where.topics = {
      some: {
        topic: {
          OR: [{ slug: filters.topic }, { parent: { slug: filters.topic } }],
        },
      },
    };
  if (filters.source) where.source = { slug: filters.source };
  if (filters.platform)
    where.source = {
      ...((where.source as Prisma.SourceWhereInput) ?? {}),
      platform: filters.platform,
    };
  if (filters.organization) where.organization = { slug: filters.organization };
  for (const key of ["type", "layer", "language", "quality"] as const)
    if (filters[key]) where[key] = filters[key];
  const from = validDate(filters.from),
    to = validDate(filters.to);
  if (to) to.setUTCHours(23, 59, 59, 999);
  if (from || to)
    where.publishedAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  const limit = boundedInteger(filters.limit, 12, 60);
  const page = boundedInteger(filters.page, 1, 100_000);
  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      include: articleInclude,
      orderBy: { publishedAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.article.count({ where }),
  ]);
  return { articles, total, page, limit, pages: Math.ceil(total / limit) };
}
export async function getSources() {
  return prisma.source.findMany({
    include: {
      organization: true,
      articles: {
        where: { status: "published" },
        include: { topics: { include: { topic: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });
}
export async function getTimeline(topicSlug?: string) {
  return prisma.article.findMany({
    where: {
      status: "published",
      publishedAt: { not: null },
      ...(topicSlug
        ? {
            topics: {
              some: {
                topic: {
                  OR: [{ slug: topicSlug }, { parent: { slug: topicSlug } }],
                },
              },
            },
          }
        : {}),
    },
    include: articleInclude,
    orderBy: { publishedAt: "desc" },
  });
}
