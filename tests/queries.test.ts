import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createClient } from "@libsql/client";

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
  const client = createClient({ url: process.env.DATABASE_URL });
  await client.executeMultiple(
    await readFile(
      "prisma/migrations/20261114000000_init/migration.sql",
      "utf8",
    ),
  );
  client.close();
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
  assert.equal(home.count, 27);
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
