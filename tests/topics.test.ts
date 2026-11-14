import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { initializeDatabase } from "./helpers/database";
import { createDb } from "../src/lib/db";
import {
  saveTopicRecord,
  deleteTopicRecord,
  type TopicInput,
} from "../src/lib/editor/topics";
let directory: string;
let db: PrismaClient;
const topic = (
  slug: string,
  overrides: Partial<TopicInput> = {},
): TopicInput => ({
  slug,
  name: `测试主题 ${slug}`,
  englishName: `Test ${slug}`,
  description: "用于验证数据库层级、公开阅读路径与审核操作的完整主题说明。",
  question: "如何维护可追溯的主题？",
  concepts: ["验证", "关联"],
  readingPath: [],
  featured: false,
  sortOrder: 0,
  parentId: null,
  ...overrides,
});
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "atlas-topics-"));
  const url = `file:${join(directory, "test.db")}`;
  await initializeDatabase(url);
  db = createDb(url);
});
after(async () => {
  await db?.$disconnect();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("topic editing keeps ordered cross-topic published reading paths and audit snapshots", async () => {
  for (const slug of ["first-reading", "second-reading"])
    await db.article.create({
      data: {
        slug,
        title: "阅读资料",
        originalTitle: slug,
        url: `https://example.com/${slug}`,
        canonicalUrl: `https://example.com/${slug}`,
        status: "published",
      },
    });
  const created = await saveTopicRecord(
    topic("reading-path", {
      readingPath: ["second-reading", "first-reading", "second-reading"],
      concepts: ["验证", "验证", "关联"],
      featured: true,
    }),
    db,
  );
  assert.deepEqual(created.readingPath, ["second-reading", "first-reading"]);
  assert.deepEqual(created.concepts, ["验证", "关联"]);
  const updated = await saveTopicRecord(
    topic("reading-path", {
      id: created.id,
      name: "人工修订主题",
      readingPath: ["first-reading"],
      sortOrder: -20,
    }),
    db,
  );
  assert.equal(updated.name, "人工修订主题");
  assert.equal(updated.sortOrder, -20);
  const logs = await db.auditLog.findMany({
    where: { entityId: created.id },
    orderBy: { createdAt: "asc" },
  });
  assert.deepEqual(
    logs.map((log) => log.action),
    ["topic.created", "topic.updated"],
  );
  assert.equal(
    (logs[1].detail as { before: { name: string } }).before.name,
    created.name,
  );
});

test("topic hierarchy rejects self and descendant cycles transactionally", async () => {
  const parent = await saveTopicRecord(topic("parent"), db);
  const child = await saveTopicRecord(
    topic("child", { parentId: parent.id }),
    db,
  );
  const grandchild = await saveTopicRecord(
    topic("grandchild", { parentId: child.id }),
    db,
  );
  const count = await db.auditLog.count();
  await assert.rejects(
    saveTopicRecord(
      topic("parent", { id: parent.id, parentId: parent.id }),
      db,
    ),
    /自己的父主题/,
  );
  await assert.rejects(
    saveTopicRecord(
      topic("parent", { id: parent.id, parentId: grandchild.id }),
      db,
    ),
    /循环/,
  );
  await assert.rejects(
    saveTopicRecord(topic("child", { id: child.id, parentId: "missing" }), db),
    /父主题不存在/,
  );
  assert.equal(
    (await db.topic.findUniqueOrThrow({ where: { id: parent.id } })).parentId,
    null,
  );
  assert.equal(await db.auditLog.count(), count);
});

test("delete and slug changes protect referenced topics and preserve related records", async () => {
  const parent = await saveTopicRecord(topic("delete-parent"), db);
  const child = await saveTopicRecord(
    topic("delete-child", { parentId: parent.id }),
    db,
  );
  await assert.rejects(
    deleteTopicRecord(parent.id, parent.slug, db),
    /关联资料、子主题或知识关系/,
  );
  await assert.rejects(
    saveTopicRecord(topic("renamed", { id: parent.id }), db),
    /不能修改标识/,
  );
  await assert.rejects(deleteTopicRecord(child.id, "wrong", db), /准确输入/);
  const article = await db.article.findUniqueOrThrow({
    where: { slug: "first-reading" },
  });
  await db.articleTopic.create({
    data: { articleId: article.id, topicId: child.id },
  });
  await assert.rejects(
    deleteTopicRecord(child.id, child.slug, db),
    /关联资料、子主题或知识关系/,
  );
  assert(await db.article.findUnique({ where: { id: article.id } }));
  await db.articleTopic.deleteMany({ where: { topicId: child.id } });
  const relation = await db.relation.create({
    data: { type: "related_to", fromTopicId: parent.id, toTopicId: child.id },
  });
  await assert.rejects(
    deleteTopicRecord(child.id, child.slug, db),
    /关联资料、子主题或知识关系/,
  );
  await db.relation.delete({ where: { id: relation.id } });
  await deleteTopicRecord(child.id, child.slug, db);
  assert.equal(await db.topic.findUnique({ where: { id: child.id } }), null);
  assert.equal(
    await db.auditLog.count({
      where: { entityId: child.id, action: "topic.deleted" },
    }),
    1,
  );
  await deleteTopicRecord(parent.id, parent.slug, db);
});

test("invalid reading paths and input never create partial topics or audit entries", async () => {
  await db.article.create({
    data: {
      slug: "private-reading",
      title: "待审核资料",
      originalTitle: "private",
      url: "https://example.com/private",
      canonicalUrl: "https://example.com/private",
      status: "pending_review",
    },
  });
  const topics = await db.topic.count(),
    logs = await db.auditLog.count();
  await assert.rejects(
    saveTopicRecord(
      topic("private-path", { readingPath: ["private-reading"] }),
      db,
    ),
    /仅接受已发布资料/,
  );
  await assert.rejects(
    saveTopicRecord(
      topic("missing-path", { readingPath: ["missing-reading"] }),
      db,
    ),
    /仅接受已发布资料/,
  );
  await assert.rejects(saveTopicRecord(topic("../unsafe"), db));
  await assert.rejects(
    saveTopicRecord(topic("sort-overflow", { sortOrder: Infinity }), db),
  );
  assert.equal(await db.topic.count(), topics);
  assert.equal(await db.auditLog.count(), logs);
});
