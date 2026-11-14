import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { initializeDatabase } from "./helpers/database";

let dir: string;
let db: typeof import("../src/lib/db").prisma;
let query: typeof import("../src/lib/queries");
function seed() {
  execFileSync(process.execPath, ["--import", "tsx", "prisma/seed.ts"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "pipe",
  });
}
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "agent-atlas-queries-"));
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
  await initializeDatabase(process.env.DATABASE_URL);
  seed();
  db = (await import("../src/lib/db")).prisma;
  query = await import("../src/lib/queries");
});
after(async () => {
  await db?.$disconnect();
  if (dir) await rm(dir, { recursive: true, force: true });
});

test("Chinese search and combined source/topic/layer filters query the database", async () => {
  const found = await query.searchArticles({
    q: "上下文",
    topic: "context-engineering",
    layer: "engineering",
    source: "anthropic-engineering",
  });
  assert.ok(found.total >= 1);
  assert.ok(found.articles.some((a) => a.slug === "context-engineering"));
  assert.ok(
    found.articles.every(
      (a) =>
        a.layer === "engineering" && a.source?.slug === "anthropic-engineering",
    ),
  );
  const empty = await query.searchArticles({ q: "不存在的阿特拉斯条目" });
  assert.equal(empty.total, 0);
  const date = await query.searchArticles({
    from: "2024-01-01",
    to: "2024-12-31",
    type: "paper",
  });
  assert.ok(date.articles.length > 0);
  assert.ok(
    date.articles.every(
      (a) => a.publishedAt && a.publishedAt.getUTCFullYear() === 2024,
    ),
  );
});

test("public queries hide draft/archived articles and relations pointing to them", async () => {
  const publicArticle = await db.article.findUniqueOrThrow({
    where: { slug: "react" },
  });
  const topic = await db.topic.findUniqueOrThrow({
    where: { slug: "architecture" },
  });
  for (const status of ["pending_review", "archived"]) {
    const hidden = await db.article.create({
      data: {
        slug: `hidden-${status}`,
        title: "绝密隐藏测试",
        originalTitle: "hidden",
        url: `https://example.org/${status}`,
        canonicalUrl: `https://example.org/${status}`,
        status,
        publishedAt: new Date(),
        topics: { create: { topicId: topic.id } },
      },
    });
    await db.relation.create({
      data: {
        type: "references",
        status: "confirmed",
        fromArticleId: publicArticle.id,
        toArticleId: hidden.id,
        evidenceUrl: "https://example.org/evidence",
      },
    });
    await db.relation.create({
      data: {
        type: "related_to",
        status: "confirmed",
        fromTopicId: topic.id,
        toArticleId: hidden.id,
        evidenceUrl: "https://example.org/evidence",
      },
    });
    await db.relation.create({
      data: {
        type: "related_to",
        status: "confirmed",
        fromArticleId: hidden.id,
        toTopicId: topic.id,
        evidenceUrl: "https://example.org/evidence",
      },
    });
    assert.equal(await query.getArticle(hidden.slug), null);
  }
  assert.equal((await query.searchArticles({ q: "绝密隐藏测试" })).total, 0);
  const article = await query.getArticle("react");
  assert.ok(article);
  assert.ok(
    article.outgoing.every(
      (r) => !r.toArticle || r.toArticle.status === "published",
    ),
  );
  const dossier = await query.getTopic("architecture");
  assert.ok(dossier);
  assert.ok(dossier.articles.every((a) => a.status === "published"));
  assert.ok(
    dossier.outgoing.every(
      (r) => !r.toArticle || r.toArticle.status === "published",
    ),
  );
  assert.ok(
    dossier.incoming.every(
      (r) => !r.fromArticle || r.fromArticle.status === "published",
    ),
  );
  assert.ok((await query.getTimeline()).every((a) => a.status === "published"));
});

test("re-running seed preserves editor changes and does not duplicate content", async () => {
  await db.article.update({
    where: { slug: "react" },
    data: { title: "人工编辑后标题" },
  });
  const beforeCount = await db.article.count();
  seed();
  assert.equal(await db.article.count(), beforeCount);
  assert.equal(
    (await db.article.findUniqueOrThrow({ where: { slug: "react" } })).title,
    "人工编辑后标题",
  );
  const home = await query.getHomeData();
  assert.equal(home.topics.length, 7);
  assert.equal(home.count, 33);
  assert.equal(home.guides.length, 6);
  assert.ok(home.featuredTopics.length >= 3);
});

test("search clamps pagination and ignores impossible calendar dates", async () => {
  for (const page of [Infinity, -Infinity, NaN]) {
    const result = await query.searchArticles({ page });
    assert.equal(result.page, 1);
    assert.ok(result.articles.length > 0);
  }
  assert.equal((await query.searchArticles({ page: 1e99 })).page, 100_000);
  assert.equal((await query.searchArticles({ page: -3 })).page, 1);
  assert.equal((await query.searchArticles({ page: 2.8 })).page, 2);
  const normal = await query.searchArticles();
  const invalid = await query.searchArticles({
    from: "2025-02-31",
    to: "2025-02-29",
    limit: Infinity,
  });
  assert.equal(invalid.total, normal.total);
  assert.equal(invalid.limit, 12);
  assert.deepEqual(
    invalid.articles.map((a) => a.id),
    normal.articles.map((a) => a.id),
  );
  const leapDay = await query.searchArticles({
    from: "2024-02-29",
    to: "2024-02-29",
  });
  assert.equal(leapDay.total, 0);
});

test("original guide body is searchable while source filters use the public source slug", async () => {
  const entry = await db.article.findUniqueOrThrow({
    where: { slug: "atlas-context-budget" },
  });
  const body = entry.bodyMarkdown;
  try {
    await db.article.update({
      where: { id: entry.id },
      data: { bodyMarkdown: `${body}\n\n独有正文检索哨兵` },
    });
    const found = await query.searchArticles({
      q: "独有正文检索哨兵",
      source: "agent-atlas-originals",
    });
    assert.equal(found.total, 1);
    assert.equal(found.articles[0].slug, entry.slug);
    const guides = await query.searchArticles({
      source: "agent-atlas-originals",
    });
    assert.equal(guides.total, 6);
  } finally {
    await db.article.update({
      where: { id: entry.id },
      data: { bodyMarkdown: body },
    });
  }
});

test("weighted relevance ranks titles over newer summary-only matches and paginates stably", async () => {
  const make = (
    slug: string,
    title: string,
    summary: string,
    publishedAt: Date,
  ) =>
    db.article.create({
      data: {
        slug,
        title,
        originalTitle: title,
        url: `https://example.org/${slug}`,
        canonicalUrl: `https://example.org/${slug}`,
        summary,
        status: "published",
        publishedAt,
      },
    });
  const title = await make(
    "rank-title",
    "独有评测词 工程指南",
    "内容介绍",
    new Date("2020-01-01"),
  );
  const summary = await make(
    "rank-summary",
    "新发布的指南",
    "独有评测词 只在摘要里",
    new Date("2026-01-01"),
  );
  const ranked = await query.searchArticles({ q: "独有评测词", limit: 1 });
  assert.equal(ranked.sort, "relevance");
  assert.equal(ranked.total, 2);
  assert.equal(ranked.articles[0].id, title.id);
  assert.equal(
    (await query.searchArticles({ q: "独有评测词", limit: 1, page: 2 }))
      .articles[0].id,
    summary.id,
  );
  assert.equal(
    (await query.searchArticles({ q: "独有评测词", sort: "newest" }))
      .articles[0].id,
    summary.id,
  );
  assert.equal(
    (await query.searchArticles({ q: "独有评测词", sort: "oldest" }))
      .articles[0].id,
    title.id,
  );
  assert.equal((await query.searchArticles({ q: "' OR 1=1 --" })).total, 0);
  assert.ok((await query.searchArticles({ q: "SWE-BENCH" })).total > 0);
  await db.article.deleteMany({
    where: { id: { in: [title.id, summary.id] } },
  });
});

test("topic discovery follows all descendants and published reading paths across themes", async () => {
  const parent = await db.topic.findUniqueOrThrow({
    where: { slug: "architecture" },
  });
  const child = await db.topic.create({
    data: {
      slug: "test-child",
      name: "Child",
      englishName: "Child",
      description: "",
      question: "",
      parentId: parent.id,
    },
  });
  const grandchild = await db.topic.create({
    data: {
      slug: "test-grandchild",
      name: "Grandchild",
      englishName: "Grandchild",
      description: "",
      question: "",
      parentId: child.id,
    },
  });
  const a = await db.article.create({
    data: {
      slug: "deep-topic",
      title: "深层主题测试",
      originalTitle: "Nested research",
      url: "https://example.org/deep-topic",
      canonicalUrl: "https://example.org/deep-topic",
      status: "published",
      type: "paper",
      publishedAt: new Date(),
      topics: { create: { topicId: grandchild.id } },
    },
  });
  assert.ok(
    (await query.getTopic("architecture"))?.articles.some(
      (row) => row.id === a.id,
    ),
  );
  assert.ok(
    (
      await query.searchArticles({ topic: "architecture", q: "深层主题测试" })
    ).articles.some((row) => row.id === a.id),
  );
  assert.ok(
    (await query.getTimeline("architecture", "paper")).some(
      (row) => row.id === a.id,
    ),
  );
  assert.ok(
    !(await query.getTimeline("architecture", "docs")).some(
      (row) => row.id === a.id,
    ),
  );
  const selected = await db.topic.create({
    data: {
      slug: "cross-path",
      name: "Cross",
      englishName: "Cross",
      description: "",
      question: "",
      readingPath: ["deep-topic"],
    },
  });
  assert.equal(
    (await query.getTopic("cross-path"))?.readingPathArticles[0].id,
    a.id,
  );
  await db.article.delete({ where: { id: a.id } });
  await db.topic.deleteMany({
    where: { id: { in: [selected.id, grandchild.id, child.id] } },
  });
});

test("knowledge graph only exposes confirmed relations between public endpoints with evidence direction", async () => {
  const topic = await db.topic.findUniqueOrThrow({
    where: { slug: "architecture" },
  });
  const article = await db.article.findUniqueOrThrow({
    where: { slug: "react" },
  });
  const confirmed = await db.relation.create({
    data: {
      type: "prerequisite_for",
      status: "confirmed",
      description: "Test editorial prerequisite",
      evidenceUrl: "https://example.org/evidence",
      fromArticleId: article.id,
      toTopicId: topic.id,
    },
  });
  const suggested = await db.relation.create({
    data: {
      type: "prerequisite_for",
      status: "suggested",
      fromTopicId: topic.id,
      toArticleId: article.id,
    },
  });
  const graph = await query.getKnowledgeGraph({
    topic: "architecture",
    type: "prerequisite_for",
  });
  assert.ok(
    graph.edges.some(
      (e) =>
        e.id === confirmed.id &&
        e.from === `article:${article.id}` &&
        e.to === `topic:${topic.id}`,
    ),
  );
  assert.ok(!graph.edges.some((e) => e.id === suggested.id));
  assert.ok(graph.nodes.some((n) => n.href === "/articles/react"));
  const all = await query.getKnowledgeGraph();
  assert.ok(all.nodes.every((n) => !n.label.includes("绝密隐藏测试")));
  assert.ok(
    !all.edges.some((e) => e.id === "relation-suggested-community-context"),
  );
  assert.equal(
    (await query.getKnowledgeGraph({ topic: "does-not-exist" })).total,
    0,
  );
  await db.relation.deleteMany({
    where: { id: { in: [confirmed.id, suggested.id] } },
  });
});
