import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb } from "../src/lib/db";
import { initializeDatabase } from "./helpers/database";
import { importEditorialPack } from "../src/lib/editorial/import";
import {
  editorialPackSchema,
  editorialProvenance,
  editorialOriginalUrl,
  type EditorialEntry,
} from "../src/lib/editorial/schema";
import {
  writeEditorialMarkdown,
  verifyEditorialMarkdown,
} from "../src/lib/editorial/files";

let directory: string;
let db: ReturnType<typeof createDb>;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "atlas-content-"));
  const url = `file:${join(directory, "content.db")}`;
  await initializeDatabase(url);
  db = createDb(url);
  await db.topic.create({
    data: {
      id: "test-topic",
      slug: "test-topic",
      name: "测试主题",
      englishName: "Test",
      description: "内容验证",
      question: "如何验证？",
    },
  });
});
after(async () => {
  await db?.$disconnect();
  if (directory) await rm(directory, { recursive: true, force: true });
});

const entry = (slug: string): EditorialEntry => ({
  slug,
  title: "通过可验证资料理解工具调用边界",
  summary:
    "这篇原创指南说明工具调用的边界、可验证依据与工程建议，保留来源以便读者进一步核对。",
  bodyMarkdown: `## 任务边界\n\n${"模型生成的计划需要可验证的执行结果，工具接口与权限控制应分别设计。".repeat(25)}`,
  takeaways: [
    "先确定可执行的任务判定",
    "对每次工具调用检查权限",
    "保留来源和故障证据以便复现",
  ],
  audience: "编写工具接口的开发者",
  topics: ["test-topic"],
  references: ["one", "two", "three"].map((name) => ({
    url: `https://example.org/docs/${name}`,
    title: `原始资料 ${name}`,
    locator: "README 的工具说明章节，核对接口职责。",
  })),
  verifiedAt: "2026-11-14",
});

test("editorial packs reject invalid dates, unsafe references, duplicates and unknown fields", () => {
  const row = entry("valid-entry");
  assert.equal(editorialPackSchema.parse([row]).length, 1);
  for (const changed of [
    { ...row, verifiedAt: "2026-02-30" },
    { ...row, verifiedAt: "2999-01-01" },
    {
      ...row,
      references: [
        { ...row.references[0], url: "http://example.org/docs" },
        ...row.references.slice(1),
      ],
    },
    {
      ...row,
      references: [
        { ...row.references[0], url: "https://user:password@example.org/docs" },
        ...row.references.slice(1),
      ],
    },
    { ...row, topics: ["test-topic", "test-topic"] },
    { ...row, bodyMarkdown: "过短" },
    { ...row, humanReviewed: true },
  ])
    assert.equal(editorialPackSchema.safeParse([changed]).success, false);
  assert.equal(editorialPackSchema.safeParse([row, row]).success, false);
  assert.equal(
    editorialProvenance({
      origin: "human",
      verifiedAt: row.verifiedAt,
      references: row.references,
    }),
    null,
  );
});

test("dry run validates the whole pack without writing articles, sources or audit records", async () => {
  const before = {
    articles: await db.article.count(),
    sources: await db.source.count(),
    audits: await db.auditLog.count(),
  };
  const result = await importEditorialPack(db, [entry("dry-run")], {
    dryRun: true,
    publish: true,
  });
  assert.deepEqual(result, { created: ["dry-run"], skipped: [], dryRun: true });
  assert.deepEqual(
    {
      articles: await db.article.count(),
      sources: await db.source.count(),
      audits: await db.auditLog.count(),
    },
    before,
  );
  await assert.rejects(
    importEditorialPack(db, [
      entry("valid-before-missing"),
      { ...entry("missing-topic"), topics: ["does-not-exist"] },
    ]),
    /不存在的主题/,
  );
  assert.equal(
    await db.article.count({ where: { slug: "valid-before-missing" } }),
    0,
  );
});

test("imports default to pending, preserve provenance, and never overwrite or promote existing edits", async () => {
  const row = entry("append-only");
  assert.deepEqual((await importEditorialPack(db, [row])).created, [row.slug]);
  const article = await db.article.findUniqueOrThrow({
    where: { slug: row.slug },
  });
  assert.equal(article.status, "pending_review");
  assert.equal(article.reviewedAt, null);
  assert.equal(article.bodyMarkdown, row.bodyMarkdown);
  assert.equal(article.sourceId, "source-agent-atlas");
  assert.deepEqual(article.aiDraft, row);
  assert.deepEqual(editorialProvenance(article.rawMetadata), {
    references: row.references,
    verifiedAt: row.verifiedAt,
  });
  await db.article.update({
    where: { id: article.id },
    data: { title: "保留编辑器里的最新人工修改", bodyMarkdown: "人工修订正文" },
  });
  const again = await importEditorialPack(
    db,
    [{ ...row, title: "后续生成内容不能覆盖编辑器" }],
    { publish: true },
  );
  assert.deepEqual(again.skipped, [row.slug]);
  const retained = await db.article.findUniqueOrThrow({
    where: { id: article.id },
  });
  assert.equal(retained.title, "保留编辑器里的最新人工修改");
  assert.equal(retained.bodyMarkdown, "人工修订正文");
  assert.equal(retained.status, "pending_review");
  assert.equal(await db.auditLog.count({ where: { entityId: article.id } }), 1);
});

test("explicit publication records Codex attribution without fabricating a human review", async () => {
  const row = entry("published-guide");
  await importEditorialPack(db, [row], { publish: true });
  const article = await db.article.findUniqueOrThrow({
    where: { slug: row.slug },
    include: { links: true },
  });
  assert.equal(article.status, "published");
  assert.ok(article.publishedAt);
  assert.equal(article.reviewedAt, null);
  assert.equal(article.authorName, "Agent Atlas · Codex 辅助整理");
  assert.equal(article.canonicalUrl, editorialOriginalUrl(row.slug));
  assert.equal(article.links.length, 1);
  assert.equal(article.links[0].url, article.url);
});

test("URL ownership conflicts and late database errors roll back the whole content batch", async () => {
  const conflicting = entry("claimed-url");
  await db.article.create({
    data: {
      slug: "other-owner",
      title: "另一条目",
      originalTitle: "Other",
      url: "https://example.org/other",
      canonicalUrl: editorialOriginalUrl(conflicting.slug),
    },
  });
  await assert.rejects(
    importEditorialPack(db, [entry("not-created"), conflicting]),
    /属于其他内容/,
  );
  assert.equal(await db.article.count({ where: { slug: "not-created" } }), 0);

  const late = entry("late-conflict");
  await db.article.create({
    data: {
      id: `article-${late.slug}`,
      slug: "preexisting-id",
      title: "既有条目",
      originalTitle: "Existing",
      url: "https://example.org/existing",
      canonicalUrl: "https://example.org/existing",
    },
  });
  const audits = await db.auditLog.count();
  await assert.rejects(
    importEditorialPack(db, [entry("rollback-created"), late]),
  );
  assert.equal(
    await db.article.count({ where: { slug: "rollback-created" } }),
    0,
  );
  assert.equal(await db.auditLog.count(), audits);
});

test("Markdown export carries content, source evidence and disclosed authorship", async () => {
  const row = entry("readable-original");
  await writeEditorialMarkdown([row], join(directory, "guides"));
  const markdown = await readFile(
    join(directory, "guides", `${row.slug}.md`),
    "utf8",
  );
  assert.ok(markdown.includes(row.title));
  assert.ok(markdown.includes(row.bodyMarkdown));
  assert.ok(markdown.includes("未标注为人工审核"));
  for (const reference of row.references)
    assert.ok(markdown.includes(reference.url));
  await verifyEditorialMarkdown([row], join(directory, "guides"));
  await writeFile(join(directory, "guides", `${row.slug}.md`), "stale content");
  await assert.rejects(
    verifyEditorialMarkdown([row], join(directory, "guides")),
    /不一致/,
  );
  await assert.rejects(
    verifyEditorialMarkdown(
      [entry("missing-original")],
      join(directory, "guides"),
    ),
    /缺少/,
  );
  await assert.rejects(
    writeEditorialMarkdown(
      [{ ...row, slug: "../escape" }],
      join(directory, "guides"),
    ),
  );
});
