import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { keywordSql, normalizeSearch, resolveSearchSort } from "./search/query";

export const publicRelationWhere: Prisma.RelationWhereInput = {
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
  const [topics, featuredTopics, latest, engineering, sources, count, guides] =
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
      prisma.article.findMany({
        where: { status: "published", sourceId: "source-agent-atlas" },
        include: articleInclude,
        orderBy: [{ publishedAt: "desc" }, { slug: "asc" }],
        take: 6,
      }),
    ]);
  return {
    topics,
    featuredTopics,
    latest,
    engineering,
    sources,
    count,
    guides,
  };
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
  const topicIds = await getTopicDescendantIds(slug);
  const articles = await prisma.article.findMany({
    where: {
      status: "published",
      topics: { some: { topicId: { in: topicIds } } },
    },
    include: articleInclude,
    orderBy: { publishedAt: "desc" },
  });
  const pathSlugs = parseStringList(topic.readingPath);
  const pathArticles = await prisma.article.findMany({
    where: { status: "published", slug: { in: pathSlugs } },
    include: articleInclude,
  });
  const readingPath = pathSlugs
    .map((slug) => pathArticles.find((a) => a.slug === slug))
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
  sort?: string;
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
/** Recursive UNION terminates even if externally edited data contains a cycle. */
export async function getTopicDescendantIds(slug: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    WITH RECURSIVE descendants(id) AS (
      SELECT id FROM "Topic" WHERE slug = ${slug}
      UNION SELECT t.id FROM "Topic" t JOIN descendants d ON t."parentId" = d.id
    ) SELECT id FROM descendants`);
  return rows.map((row) => row.id);
}
export async function searchArticles(filters: SearchFilters = {}) {
  const { query, terms } = normalizeSearch(filters.q);
  const keyword = keywordSql(terms, query);
  const conditions: Prisma.Sql[] = [
    Prisma.sql`a.status = 'published'`,
    keyword.match,
  ];
  if (filters.topic) {
    const ids = await getTopicDescendantIds(filters.topic);
    conditions.push(
      ids.length
        ? Prisma.sql`EXISTS (SELECT 1 FROM "ArticleTopic" at WHERE at."articleId" = a.id AND at."topicId" IN (${Prisma.join(ids)}))`
        : Prisma.sql`1 = 0`,
    );
  }
  if (filters.source) conditions.push(Prisma.sql`s.slug = ${filters.source}`);
  if (filters.platform)
    conditions.push(Prisma.sql`s.platform = ${filters.platform}`);
  if (filters.organization)
    conditions.push(Prisma.sql`o.slug = ${filters.organization}`);
  if (filters.type) conditions.push(Prisma.sql`a.type = ${filters.type}`);
  if (filters.layer) conditions.push(Prisma.sql`a.layer = ${filters.layer}`);
  if (filters.language)
    conditions.push(Prisma.sql`a.language = ${filters.language}`);
  if (filters.quality)
    conditions.push(Prisma.sql`a.quality = ${filters.quality}`);
  const from = validDate(filters.from),
    to = validDate(filters.to);
  if (to) to.setUTCHours(23, 59, 59, 999);
  if (from)
    conditions.push(
      Prisma.sql`julianday(a."publishedAt") >= julianday(${from.toISOString()})`,
    );
  if (to)
    conditions.push(
      Prisma.sql`julianday(a."publishedAt") <= julianday(${to.toISOString()})`,
    );
  const limit = boundedInteger(filters.limit, 12, 60);
  const page = boundedInteger(filters.page, 1, 100_000);
  const sort = resolveSearchSort(filters.sort, !!query);
  const base = Prisma.sql`FROM "Article" a LEFT JOIN "Source" s ON s.id = a."sourceId" LEFT JOIN "Organization" o ON o.id = a."organizationId" WHERE ${Prisma.join(conditions, " AND ")}`;
  const ordering =
    sort === "relevance"
      ? Prisma.sql`score DESC, a."publishedAt" DESC, a.id ASC`
      : sort === "oldest"
        ? Prisma.sql`a."publishedAt" IS NULL ASC, a."publishedAt" ASC, a.id ASC`
        : Prisma.sql`a."publishedAt" DESC, a.id ASC`;
  const [ranked, counts] = await Promise.all([
    prisma.$queryRaw<{ id: string; score: number }[]>(
      Prisma.sql`SELECT a.id, ${keyword.score} AS score ${base} ORDER BY ${ordering} LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    ),
    prisma.$queryRaw<{ total: number | bigint }[]>(
      Prisma.sql`SELECT count(*) AS total ${base}`,
    ),
  ]);
  const records = ranked.length
    ? await prisma.article.findMany({
        where: { id: { in: ranked.map((row) => row.id) }, status: "published" },
        include: articleInclude,
      })
    : [];
  const byId = new Map(records.map((article) => [article.id, article]));
  const articles = ranked.flatMap((row) => {
    const article = byId.get(row.id);
    return article ? [article] : [];
  });
  const total = Number(counts[0]?.total || 0);
  return {
    articles,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    sort,
  };
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
export async function getTimeline(topicSlug?: string, type?: string) {
  const ids = topicSlug ? await getTopicDescendantIds(topicSlug) : undefined;
  return prisma.article.findMany({
    where: {
      status: "published",
      publishedAt: { not: null },
      ...(ids ? { topics: { some: { topicId: { in: ids } } } } : {}),
      ...(type ? { type } : {}),
    },
    include: articleInclude,
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
  });
}

export async function getKnowledgeGraph(
  filters: { topic?: string; type?: string } = {},
) {
  const descendantIds = filters.topic
    ? await getTopicDescendantIds(filters.topic)
    : undefined;
  const where: Prisma.RelationWhereInput = {
    ...publicRelationWhere,
    ...(filters.type ? { type: filters.type } : {}),
    ...(descendantIds
      ? {
          OR: [
            { fromTopicId: { in: descendantIds } },
            { toTopicId: { in: descendantIds } },
            {
              fromArticle: {
                topics: { some: { topicId: { in: descendantIds } } },
              },
            },
            {
              toArticle: {
                topics: { some: { topicId: { in: descendantIds } } },
              },
            },
          ],
        }
      : {}),
  };
  const [relations, total] = await Promise.all([
    prisma.relation.findMany({
      where,
      include: {
        fromTopic: true,
        toTopic: true,
        fromArticle: true,
        toArticle: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 60,
    }),
    prisma.relation.count({ where }),
  ]);
  const nodes = new Map<string, import("./search/relations").GraphNode>();
  const edges: import("./search/relations").GraphEdge[] = [];
  for (const relation of relations) {
    const from = relation.fromTopic
      ? {
          id: `topic:${relation.fromTopic.id}`,
          kind: "topic" as const,
          label: relation.fromTopic.name,
          href: `/topics/${relation.fromTopic.slug}`,
        }
      : relation.fromArticle
        ? {
            id: `article:${relation.fromArticle.id}`,
            kind: "article" as const,
            label: relation.fromArticle.title,
            href: `/articles/${relation.fromArticle.slug}`,
          }
        : null;
    const to = relation.toTopic
      ? {
          id: `topic:${relation.toTopic.id}`,
          kind: "topic" as const,
          label: relation.toTopic.name,
          href: `/topics/${relation.toTopic.slug}`,
        }
      : relation.toArticle
        ? {
            id: `article:${relation.toArticle.id}`,
            kind: "article" as const,
            label: relation.toArticle.title,
            href: `/articles/${relation.toArticle.slug}`,
          }
        : null;
    if (!from || !to) continue;
    nodes.set(from.id, from);
    nodes.set(to.id, to);
    edges.push({
      id: relation.id,
      from: from.id,
      to: to.id,
      type: relation.type,
      description: relation.description,
      evidenceUrl: relation.evidenceUrl,
    });
  }
  return { nodes: [...nodes.values()], edges, total };
}
