import test from "node:test";
import assert from "node:assert/strict";
import Parser from "rss-parser";
import { buildFeed, xmlEscape } from "../src/lib/feed";
test("public RSS preserves original guide and escapes XML markup", async () => {
  assert.equal(xmlEscape('<script>&"'), "&lt;script&gt;&amp;&quot;");
  const xml = buildFeed("https://atlas.example", [
    {
      slug: "guide",
      title: "工具 & 权限",
      summary: "<script>alert(1)</script> 中文导读",
      createdAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-02"),
    },
  ]);
  assert(!xml.includes("<script>"));
  const feed = await new Parser().parseString(xml);
  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0].title, "工具 & 权限");
  assert.equal(feed.items[0].link, "https://atlas.example/articles/guide");
});
