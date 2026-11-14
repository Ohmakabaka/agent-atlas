import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
async function main() {
  try {
    process.loadEnvFile(".env");
  } catch {}
  const { prisma } = await import("../src/lib/db");
  const base = process.env.BASE_URL || "http://127.0.0.1:3000";
  assert(
    process.env.ADMIN_PASSWORD,
    "ADMIN_PASSWORD is required for editorial browser tests",
  );
  const run = `editor-release-${Date.now()}`;
  const topic = await prisma.topic.findFirstOrThrow();
  const article = await prisma.article.create({
    data: {
      slug: run,
      title: `版本管理验收${run}`,
      originalTitle: "Editorial version verification",
      url: `https://example.org/${run}`,
      canonicalUrl: `https://example.org/${run}`,
      summary: "这是一篇专用于版本恢复验收的中文测试资料，不代表外部研究成果。",
      status: "pending_review",
      topics: { create: { topicId: topic.id } },
    },
  });
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync("/usr/bin/chromium")
        ? "/usr/bin/chromium"
        : chromium.executablePath()),
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  let createdTopicId: string | undefined;
  try {
    await page.goto(`${base}/admin/login`);
    await page
      .getByLabel("编辑口令", { exact: true })
      .fill(process.env.ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "进入工作台", exact: true }).click();
    await page.waitForURL("**/admin");
    await page.goto(`${base}/admin/articles/${article.id}`);
    const oldTab = await context.newPage();
    await oldTab.goto(`${base}/admin/articles/${article.id}`);
    await page.locator('[name="title"]').fill(`已发布的新版本${run}`);
    await page.locator('[name="hasEngineeringCase"]').check();
    await page.locator('[name="case_problem"]').fill("验证工程问题记录");
    await page.locator('[name="case_architecture"]').fill("服务器与数据库");
    await page.locator('[name="case_solution"]').fill("版本快照与事务保存");
    await page
      .locator('[name="case_outcome"]')
      .fill("测试流程，不宣称实际工程收益");
    await page.locator('[name="revisionNote"]').fill("首次审核并补充工程案例");
    await page.locator('[name="status"]').selectOption("published");
    await page
      .getByRole("button", { name: "保存内容与审核状态", exact: true })
      .click();
    await page.waitForURL(
      (url) =>
        url.searchParams.get("notice")?.startsWith("内容已保存") ?? false,
    );
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLInputElement>('input[name="version"]')
          ?.value === "2",
    );
    assert.equal(
      (await prisma.article.findUniqueOrThrow({ where: { id: article.id } }))
        .version,
      2,
    );
    await oldTab.locator('[name="title"]').fill(`过期窗口的输入仍需保留${run}`);
    await oldTab
      .getByRole("button", { name: "保存内容与审核状态", exact: true })
      .click();
    await oldTab
      .getByText("这篇资料已被另一个编辑窗口修改。", { exact: false })
      .waitFor();
    assert.equal(
      await oldTab.locator('[name="title"]').inputValue(),
      `过期窗口的输入仍需保留${run}`,
    );
    assert.equal(
      (await prisma.article.findUniqueOrThrow({ where: { id: article.id } }))
        .version,
      2,
    );
    console.log(
      "PASS optimistic concurrency rejects stale writes and preserves unsaved form input",
    );
    await page.goto(`${base}/admin/articles/${article.id}/history`);
    assert(
      await page
        .getByText("版本 v1 与当前版本比较", { exact: true })
        .isVisible(),
    );
    await page
      .getByRole("button", { name: "恢复 v1 为待审核", exact: true })
      .click();
    await page.waitForURL(
      (url) =>
        url.searchParams.get("notice")?.startsWith("历史内容已恢复") ?? false,
    );
    const restored = await prisma.article.findUniqueOrThrow({
      where: { id: article.id },
      include: { engineeringCase: true },
    });
    assert.equal(restored.version, 3);
    assert.equal(restored.status, "pending_review");
    assert.equal(restored.title, article.title);
    assert.equal(restored.engineeringCase, null);
    assert.equal(
      await prisma.articleRevision.count({ where: { articleId: article.id } }),
      2,
    );
    console.log(
      "PASS history comparison and restore return published changes to review without losing history",
    );
    await page.goto(`${base}/admin/topics`);
    await page.getByText("＋ 新建技术主题", { exact: true }).click();
    const form = page
      .locator("form")
      .filter({
        has: page.getByRole("button", { name: "创建主题", exact: true }),
      });
    await form.locator('[name="name"]').fill(`浏览器新增主题${run}`);
    await form
      .locator('[name="englishName"]')
      .fill("Browser taxonomy verification");
    await form.locator('[name="slug"]').fill(run);
    await form
      .locator('[name="description"]')
      .fill("浏览器验证主题创建、排序与跨主题阅读路径的完整流程。");
    await form.locator('[name="question"]').fill("怎样维护技术主题？");
    await form.locator('[name="readingPath"]').fill("react\nswe-bench");
    await form.getByRole("button", { name: "创建主题", exact: true }).click();
    await page.waitForURL((url) => url.searchParams.has("notice"));
    const savedTopic = await prisma.topic.findUniqueOrThrow({
      where: { slug: run },
    });
    createdTopicId = savedTopic.id;
    assert.deepEqual(savedTopic.readingPath, ["react", "swe-bench"]);
    await page.goto(`${base}/topics/${run}`);
    assert(
      await page
        .getByRole("heading", { name: `浏览器新增主题${run}`, exact: true })
        .isVisible(),
    );
    assert(
      (await page
        .getByRole("link", { name: /ReAct：让推理与行动相互反馈/ })
        .count()) > 0,
    );
    await page.goto(`${base}/admin/audit?type=article`);
    assert(
      (await page.getByText("article.restore", { exact: true }).count()) > 0,
    );
    console.log(
      "PASS topic creation, ordered cross-topic reading paths and authenticated audit browsing",
    );
  } finally {
    await browser.close();
    await prisma.article.delete({ where: { id: article.id } });
    await prisma.auditLog.deleteMany({
      where: {
        entityId: {
          in: [article.id, ...(createdTopicId ? [createdTopicId] : [])],
        },
      },
    });
    if (createdTopicId)
      await prisma.topic.delete({ where: { id: createdTopicId } });
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
