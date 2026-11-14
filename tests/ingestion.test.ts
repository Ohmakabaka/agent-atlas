import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeUrl,
  normalizeTitle,
  articleSlug,
  validDate,
} from "../src/lib/ingestion/normalize";
import {
  isPublicAddress,
  validatePublicUrl,
} from "../src/lib/ingestion/network";
import {
  parseBatch,
  wechatAdapter,
  parseFeed,
  extractMetadata,
} from "../src/lib/ingestion/adapters";
import { suggestTopics } from "../src/lib/ingestion/classify";

test("canonical URL removes tracking but retains identity query parameters", () => {
  assert.equal(
    canonicalizeUrl(
      "https://example.org/paper/?utm_source=feed&version=2&b=1#summary",
    ),
    "https://example.org/paper/?b=1&version=2",
  );
  assert.notEqual(
    canonicalizeUrl("https://example.org/a"),
    canonicalizeUrl("https://example.org/a/"),
  );
  assert.equal(
    canonicalizeUrl(
      "https://mp.weixin.qq.com/s?__biz=abc&mid=123&idx=1&sn=def",
    ),
    "https://mp.weixin.qq.com/s?__biz=abc&idx=1&mid=123&sn=def",
  );
});

test("SSRF rejects private, mapped, encoded, reserved and non-http targets", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.1.1",
    "169.254.169.254",
    "192.168.1.1",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
    "2002:7f00:1::",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  for (const url of [
    "file:///etc/passwd",
    "http://127.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://localhost",
    "http://test.local",
    "http://[::ffff:127.0.0.1]",
    "https://a:b@example.com",
    "http://example.com:5432",
  ])
    assert.throws(() => validatePublicUrl(url), { name: "Error" }, url);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});

test("JSON/CSV import is bounded and preserves metadata rather than full HTML", () => {
  assert.equal(
    parseBatch(
      '[{"url":"https://example.org/a","title":"研究","html":"not stored"}]',
      "json",
    )[0].title,
    "研究",
  );
  const items = parseBatch(
    'url,title\nhttps://example.org/a,"中文, 标题"\n',
    "csv",
  );
  assert.equal(items[0].title, "中文, 标题");
  assert.equal("html" in items[0], false);
  assert.throws(() => parseBatch("{}", "json"));
  assert.throws(() => parseBatch('[{"title":"missing"}]', "json"));
  assert.throws(() =>
    parseBatch(
      JSON.stringify(
        Array.from({ length: 101 }, () => ({ url: "https://example.org" })),
      ),
      "json",
    ),
  );
});

test("WeChat import remains usable without fetching or unofficial services", async () => {
  const [item] = await wechatAdapter.discover(
    "https://mp.weixin.qq.com/s/example",
  );
  assert.equal(item.language, "zh");
  assert.equal(item.layer, "community");
  await assert.rejects(wechatAdapter.discover("https://example.org/s/other"));
});

test("classification suggests relevant topics and handles no matches", () => {
  const topics = [
    {
      id: "eval",
      slug: "agent-evals",
      name: "Agent 评测",
      englishName: "Agent Evals",
    },
    {
      id: "mcp",
      slug: "mcp",
      name: "MCP",
      englishName: "Model Context Protocol",
    },
  ];
  assert.equal(
    suggestTopics("Building reliable agent evals", topics)[0].id,
    "eval",
  );
  assert.equal(suggestTopics("旅行日记", topics).length, 0);
  assert.equal(normalizeTitle("Ａgent： Evals!"), "agentevals");
  assert.equal(
    articleSlug("中文", "https://example.org/a"),
    articleSlug("中文", "https://example.org/a"),
  );
  assert.equal(validDate("not-a-date"), undefined);
});

test("HTML metadata extraction keeps cross-source canonicals as review suggestions", () => {
  const cross = extractMetadata(
    '<html lang="zh"><head><title>Fallback</title><meta property="og:title" content="MCP 研究"><meta name="description" content="元数据摘要"><link rel="canonical" href="https://other.example.org/original"></head><body>Not saved</body></html>',
    "https://example.org/reprint",
  );
  assert.equal(cross.title, "MCP 研究");
  assert.equal(cross.description, "元数据摘要");
  assert.equal(cross.canonicalUrl, "https://example.org/reprint");
  assert.equal(cross.canonicalSuggestion, "https://other.example.org/original");
  assert.equal(cross.language, "zh");
  const same = extractMetadata(
    '<link rel="canonical" href="/original">',
    "https://example.org/copy",
  );
  assert.equal(same.canonicalUrl, "https://example.org/original");
});

test("RSS and Atom parse real feed structures and discard unsafe links", async () => {
  const rss = await parseFeed(
    '<rss version="2.0"><channel><title>Research</title><link>https://example.org</link><description>Feed</description><item><title>MCP Notes</title><link>https://example.org/mcp</link><description>Metadata summary</description></item><item><title>Unsafe</title><link>http://127.0.0.1/admin</link></item></channel></rss>',
  );
  assert.equal(rss.length, 1);
  assert.equal(rss[0].title, "MCP Notes");
  const atom = await parseFeed(
    '<feed xmlns="http://www.w3.org/2005/Atom"><title>Updates</title><id>https://example.org</id><updated>2025-01-01T00:00:00Z</updated><entry><title>Agent Evals</title><id>https://example.org/evals</id><link href="https://example.org/evals"/><updated>2025-01-02T00:00:00Z</updated></entry></feed>',
  );
  assert.equal(atom.length, 1);
  assert.equal(atom[0].url, "https://example.org/evals");
  await assert.rejects(parseFeed("<broken>"));
});

test("pipeline preserves review boundary, duplicate identity and job results in SQLite", async () => {
  const { mkdtemp, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createClient } = await import("@libsql/client");
  const directory = await mkdtemp(join(tmpdir(), "atlas-ingestion-"));
  const url = `file:${join(directory, "test.db")}`;
  const oldDatabase = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  const bootstrap = createClient({ url });
  await bootstrap.executeMultiple(
    await readFile(
      "prisma/migrations/20261114000000_init/migration.sql",
      "utf8",
    ),
  );
  bootstrap.close();
  const { prisma } = await import("../src/lib/db");
  const { importUrl, importBatch, ingestItem, syncSources } = await import(
    "../src/lib/ingestion"
  );
  try {
    await prisma.topic.create({
      data: {
        slug: "mcp",
        name: "MCP",
        englishName: "Model Context Protocol",
        description: "工具互通",
        question: "如何连接工具",
      },
    });
    const first = await importUrl(
      "https://mp.weixin.qq.com/s/test-mcp?utm_source=atlas",
      { title: "MCP 工具互通的实践", summary: "人工提交的待审核导读。" },
    );
    assert.equal(first.duplicate, false);
    const article = await prisma.article.findUniqueOrThrow({
      where: { id: first.articleId },
      include: { topics: true, outgoing: true },
    });
    assert.equal(article.status, "pending_review");
    assert.equal(article.summary, "人工提交的待审核导读。");
    assert.equal(article.topics.length, 0);
    assert.ok(article.outgoing.length > 0);
    assert.ok(
      article.outgoing.every((relation) => relation.status === "suggested"),
    );
    assert.equal(
      await prisma.article.count({ where: { status: "published" } }),
      0,
    );
    await prisma.article.update({
      where: { id: article.id },
      data: {
        status: "published",
        summary: "经审核的导读",
        reviewedAt: new Date(),
      },
    });
    const duplicate = await importUrl(
      "https://mp.weixin.qq.com/s/test-mcp?utm_source=other",
      { title: "重复记录，不应覆盖", summary: "不覆盖" },
    );
    assert.equal(duplicate.articleId, article.id);
    assert.equal(duplicate.duplicate, true);
    assert.equal(
      (await prisma.article.findUniqueOrThrow({ where: { id: article.id } }))
        .summary,
      "经审核的导读",
    );
    const batch = await importBatch(
      JSON.stringify([
        { url: "https://example.org/new", title: "新资料" },
        { url: "http://169.254.169.254/latest/meta-data/", title: "拒绝私网" },
        { url: "https://example.org/new?utm_medium=feed", title: "重复" },
      ]),
      "json",
    );
    assert.equal(batch.imported, 1);
    assert.equal(batch.duplicates, 1);
    assert.equal(batch.errors.length, 1);
    assert.equal(batch.errors[0].row, 2);
    await assert.rejects(
      ingestItem({
        adapter: "json",
        url: "https://example.org/new",
        canonicalUrl: article.canonicalUrl,
      }),
      /分别属于不同内容/,
    );
    // Domain-wide catalogs must not swallow more specific organizations or paths.
    const catalog = await prisma.source.create({
      data: {
        slug: "test-github",
        name: "GitHub",
        type: "repository",
        platform: "github",
        url: "https://github.com",
      },
    });
    const team = await prisma.source.create({
      data: {
        slug: "test-team",
        name: "Team",
        type: "repository",
        platform: "github",
        url: "https://github.com/example-team/",
      },
    });
    const project = await prisma.source.create({
      data: {
        slug: "test-project",
        name: "Project",
        type: "repository",
        platform: "github",
        url: "https://github.com/example-team/agent",
      },
    });
    for (const [path, sourceId] of [
      ["/example-team/other-project", team.id],
      ["/example-team/agent/blob/main/README.md", project.id],
      ["/example-team/agent", project.id],
      ["/example-team/agent-tools", team.id],
      ["/example-teammate/agent", catalog.id],
    ]) {
      const imported = await ingestItem({
        adapter: "json",
        url: `https://github.com${path}`,
        title: path,
      });
      assert.equal(
        (
          await prisma.article.findUniqueOrThrow({
            where: { id: imported.articleId },
          })
        ).sourceId,
        sourceId,
        path,
      );
    }
    const corporate = await prisma.source.create({
      data: {
        slug: "test-corporate",
        name: "Corporate",
        type: "official",
        platform: "official",
        url: "https://corporate.example.org",
      },
    });
    const news = await prisma.source.create({
      data: {
        slug: "test-news",
        name: "News",
        type: "official",
        platform: "official",
        url: "https://corporate.example.org/news",
      },
    });
    for (const [path, sourceId] of [
      ["/news/release", news.id],
      ["/newsletter", corporate.id],
    ]) {
      const imported = await ingestItem({
        adapter: "json",
        url: `https://corporate.example.org${path}`,
        title: path,
      });
      assert.equal(
        (
          await prisma.article.findUniqueOrThrow({
            where: { id: imported.articleId },
          })
        ).sourceId,
        sourceId,
        path,
      );
    }
    const sources = await syncSources();
    assert.equal(sources.sources, 0);
    const jobs = await prisma.ingestionJob.findMany();
    assert.equal(jobs.length, 3);
    assert.ok(jobs.every((job) => job.finishedAt));
    assert.ok(
      jobs.some(
        (job) => job.status === "completed_with_errors" && job.failed === 1,
      ),
    );
  } finally {
    await prisma.$disconnect();
    if (oldDatabase === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oldDatabase;
    await rm(directory, { recursive: true, force: true });
  }
});
