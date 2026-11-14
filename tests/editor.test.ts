import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeDatabase } from "./helpers/database";
let dir: string;
let db: typeof import("../src/lib/db").prisma;
let editor: typeof import("../src/lib/editor/articles");
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "atlas-editor-"));
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
  await initializeDatabase(process.env.DATABASE_URL);
  db = (await import("../src/lib/db")).prisma;
  editor = await import("../src/lib/editor/articles");
  await db.organization.create({
    data: {
      id: "org",
      slug: "org",
      name: "真实来源机构",
      url: "https://example.org",
    },
  });
  await db.source.create({
    data: {
      id: "source",
      slug: "source",
      name: "原始来源",
      type: "official",
      platform: "web",
      url: "https://example.org",
      organizationId: "org",
    },
  });
  await db.topic.create({
    data: {
      id: "topic",
      slug: "topic",
      name: "工程主题",
      englishName: "Engineering",
      description: "工程实践",
      question: "如何实现",
    },
  });
  await db.person.create({
    data: { id: "person", name: "署名作者", organizationId: "org" },
  });
});
after(async () => {
  await db?.$disconnect();
  if (dir) await rm(dir, { recursive: true, force: true });
});
async function fixture(suffix: string) {
  return db.article.create({
    data: {
      slug: suffix,
      title: "工程内容原始中文标题",
      originalTitle: "Original engineering title",
      url: `https://example.org/${suffix}`,
      canonicalUrl: `https://example.org/${suffix}`,
      summary: "这是经过原始资料核对的中文技术导读，说明工程问题、方法与局限。",
      bodyMarkdown: "## 初始原创正文\n\n此处是用于验证版本恢复的原创正文。",
      audience: "工程师",
      type: "article",
      layer: "engineering",
      language: "zh",
      quality: "curated",
      status: "published",
      sourceId: "source",
      organizationId: "org",
      authorName: "署名作者",
      takeaways: ["来自原文的技术要点"],
      rawMetadata: { untouched: "raw" },
      aiDraft: { untouched: "draft" },
      topics: { create: { topicId: "topic" } },
      people: { create: { personId: "person" } },
      links: {
        create: { url: `https://example.org/${suffix}`, label: "原始资料" },
      },
      engineeringCase: {
        create: {
          problem: "问题",
          architecture: "架构",
          solution: "解决方案",
          outcome: "效果未量化",
          evidenceUrl: `https://example.org/${suffix}`,
        },
      },
    },
    include: { topics: true, people: true, engineeringCase: true },
  });
}
test("editor saves immutable snapshots and restores reviewed fields as a new pending revision", async () => {
  const a = await fixture("history");
  const initial = editor.articleInputSchema.parse(editor.articleSnapshot(a));
  const changed = {
    ...initial,
    title: "经过修改的工程标题",
    summary: "这是新的中文导读，补充原始内容没有说明的工程局限和假设条件。",
    bodyMarkdown: "## 新版原创正文\n\n正文修改需要随历史版本一起保存与恢复。",
    engineeringCase: null,
    personIds: [],
  };
  const result = await editor.editArticle(a.id, 1, changed, "补充边界");
  assert.equal(result.version, 2);
  const revision = await db.articleRevision.findFirstOrThrow({
    where: { articleId: a.id },
  });
  assert.equal((revision.snapshot as { status: string }).status, "published");
  assert.equal((revision.snapshot as { title: string }).title, initial.title);
  assert.equal(
    (revision.snapshot as { bodyMarkdown: string }).bodyMarkdown,
    initial.bodyMarkdown,
  );
  assert.equal(
    await db.engineeringCase.count({ where: { articleId: a.id } }),
    0,
  );
  await editor.restoreArticle(a.id, 2, revision.id);
  const restored = await db.article.findUniqueOrThrow({
    where: { id: a.id },
    include: { topics: true, people: true, engineeringCase: true },
  });
  assert.equal(restored.version, 3);
  assert.equal(restored.status, "pending_review");
  assert.equal(restored.title, initial.title);
  assert.equal(restored.bodyMarkdown, initial.bodyMarkdown);
  assert.equal(restored.engineeringCase?.architecture, "架构");
  assert.equal(restored.topics.length, 1);
  assert.equal(restored.people.length, 1);
  assert.deepEqual(restored.rawMetadata, { untouched: "raw" });
  assert.deepEqual(restored.aiDraft, { untouched: "draft" });
  assert.equal(
    await db.articleRevision.count({ where: { articleId: a.id } }),
    2,
  );
  assert.equal(
    await db.auditLog.count({
      where: { entityId: a.id, action: "article.restore" },
    }),
    1,
  );
});
test("stale editor version cannot overwrite a newer save or create partial history", async () => {
  const a = await fixture("conflict");
  const input = editor.articleInputSchema.parse(editor.articleSnapshot(a));
  await editor.editArticle(a.id, 1, {
    ...input,
    title: "第一个编辑窗口的中文标题",
  });
  await assert.rejects(
    editor.editArticle(a.id, 1, { ...input, title: "旧窗口的修改" }),
    /另一个编辑窗口/,
  );
  const current = await db.article.findUniqueOrThrow({ where: { id: a.id } });
  assert.equal(current.version, 2);
  assert.equal(current.title, "第一个编辑窗口的中文标题");
  assert.equal(
    await db.articleRevision.count({ where: { articleId: a.id } }),
    1,
  );
  assert.equal(await db.auditLog.count({ where: { entityId: a.id } }), 1);
});
test("publication validation and conflicting provenance roll back the full edit", async () => {
  const a = await fixture("validation");
  const b = await fixture("other");
  const input = editor.articleInputSchema.parse(editor.articleSnapshot(a));
  await assert.rejects(
    editor.editArticle(a.id, 1, { ...input, topicIds: [] }),
    /至少关联/,
  );
  await assert.rejects(
    editor.editArticle(a.id, 1, { ...input, publishedAt: "2025-02-31" }),
  );
  await assert.rejects(
    editor.editArticle(a.id, 1, { ...input, url: b.url }),
    /属于另一篇/,
  );
  assert.equal(
    (await db.article.findUniqueOrThrow({ where: { id: a.id } })).version,
    1,
  );
  assert.equal(
    await db.articleRevision.count({ where: { articleId: a.id } }),
    0,
  );
  assert.equal(await db.auditLog.count({ where: { entityId: a.id } }), 0);
});
test("rejection archives with a reason while preserving original published snapshot", async () => {
  const a = await fixture("rejection");
  await assert.rejects(editor.rejectArticleReview(a.id, 1, "短"), /驳回原因/);
  await editor.rejectArticleReview(a.id, 1, "原始链接无法支持文中的工程结论");
  const current = await db.article.findUniqueOrThrow({ where: { id: a.id } });
  assert.equal(current.status, "archived");
  assert.equal(current.version, 2);
  const history = await db.articleRevision.findFirstOrThrow({
    where: { articleId: a.id },
  });
  assert.equal((history.snapshot as { status: string }).status, "published");
  assert.match(history.reason, /原始链接/);
});
