import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSearch,
  resolveSearchSort,
  keywordSql,
} from "../src/lib/search/query";
import {
  articleJsonLd,
  articleMetadata,
  canonicalPath,
  escapeJsonLd,
} from "../src/lib/search/seo";

test("search normalization, sorting and bound SQL retain Chinese and treat metacharacters as data", () => {
  assert.deepEqual(normalizeSearch("  Ａgent  评测 agent  ").terms, [
    "agent",
    "评测",
  ]);
  assert.equal(resolveSearchSort("oldest", true), "oldest");
  assert.equal(resolveSearchSort("__proto__", true), "relevance");
  assert.equal(resolveSearchSort(undefined, false), "newest");
  const input = "' OR 1=1 --";
  const sql = keywordSql([input], input);
  assert.ok(!sql.match.sql.includes(input));
  assert.ok(sql.match.values.includes(input));
  assert.ok(!sql.score.sql.includes(input));
});

test("structured metadata escapes executable markup and separates original authorship from editorial guide", () => {
  const article = {
    slug: "example",
    title: "</script><script>alert(1)</script>",
    originalTitle: "Original",
    summary: "编辑导读",
    authorName: "Original author",
    url: "https://example.org/source",
    createdAt: new Date("2026-01-02"),
    updatedAt: new Date("2026-02-03"),
    publishedAt: new Date("2025-01-01"),
  };
  const json = articleJsonLd(article);
  const encoded = escapeJsonLd(json);
  assert.ok(!encoded.includes("<script>"));
  assert.ok(!encoded.includes("</script>"));
  assert.equal(JSON.parse(encoded).headline, article.title);
  assert.equal(json.author.name, "Agent Atlas 编辑");
  assert(!Array.isArray(json.isBasedOn));
  assert.equal(json.isBasedOn.author?.name, "Original author");
  assert.equal(json.datePublished, article.createdAt.toISOString());
  assert.equal(json.isBasedOn.datePublished, article.publishedAt.toISOString());
  assert.equal(articleMetadata(article).title, article.title);
  const previous = process.env.SITE_URL;
  try {
    process.env.SITE_URL = "https://atlas.example.org/base";
    assert.equal(
      canonicalPath("articles", "a/b"),
      "https://atlas.example.org/articles/a%2Fb",
    );
    process.env.SITE_URL = "javascript:alert(1)";
    assert.equal(articleMetadata(article).alternates, undefined);
    assert.equal(canonicalPath("topics", "safe"), "/topics/safe");
  } finally {
    if (previous === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = previous;
  }
});

test("Codex authored guides attribute their creation and reference evidence without exposing drafts", () => {
  const article = {
    slug: "atlas-example",
    title: "本站原创指南",
    originalTitle: "本站原创指南",
    summary: "介绍本站教程的主题与适用边界。",
    authorName: "Agent Atlas · Codex 辅助整理",
    url: "https://github.com/Ohmakabaka/agent-atlas",
    createdAt: new Date(),
    updatedAt: new Date(),
    publishedAt: new Date(),
    rawMetadata: {
      origin: "codex_session",
      verifiedAt: "2026-11-14",
      privateValue: "should-not-be-public",
      references: [1, 2, 3].map((n) => ({
        url: `https://example.org/doc-${n}`,
        title: `原始资料${n}`,
        locator: "说明所在章节",
      })),
    },
  };
  const json = articleJsonLd(article);
  assert.equal(json.author.name, article.authorName);
  assert(Array.isArray(json.isBasedOn));
  assert.equal(json.isBasedOn.length, 3);
  assert(!JSON.stringify(json).includes("should-not-be-public"));
});
