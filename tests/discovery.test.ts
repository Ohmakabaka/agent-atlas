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
