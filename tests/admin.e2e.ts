/** Run against a running local instance: npx tsx tests/admin.e2e.ts */
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

async function main() {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* CI can inject variables directly. */
  }
  const { prisma } = await import("../src/lib/db");
  const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3000";
  const password = process.env.ADMIN_PASSWORD;
  assert.ok(
    password && password.length >= 12,
    "Configure ADMIN_PASSWORD before running the editor E2E",
  );
  const runId = `atlas-e2e-${Date.now()}`;
  const title = `自动化验收：${runId}`;
  const sourceUrl = `https://mp.weixin.qq.com/s/${runId}`;
  const startedAt = new Date();
  const sourceIds = new Set(
    (await prisma.source.findMany({ select: { id: true } })).map((s) => s.id),
  );
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
  let articleId: string | undefined;
  let sourceId: string | null | undefined;
  try {
    await page.goto(`${baseUrl}/admin`);
    await page.waitForURL("**/admin/login");
    assert.equal(
      await page
        .getByRole("heading", { name: "编辑工作台", exact: true })
        .count(),
      1,
    );
    await page.getByLabel("编辑口令", { exact: true }).fill(password);
    await page.getByRole("button", { name: "进入工作台", exact: true }).click();
    await page.waitForURL("**/admin");
    console.log("PASS anonymous protection and authenticated login");

    await page.goto(`${baseUrl}/admin/import`);
    await page.locator('input[name="url"]').fill(sourceUrl);
    await page.locator('input[name="title"]').fill(title);
    await page
      .getByRole("button", { name: "导入链接并开始审核", exact: true })
      .click();
    await page.waitForURL(/\/admin\/articles\/[^/?]+/);
    articleId = new URL(page.url()).pathname.split("/").at(-1);
    assert.ok(articleId);
    let article = await prisma.article.findUniqueOrThrow({
      where: { id: articleId },
      include: { topics: true },
    });
    sourceId = article.sourceId;
    assert.equal(article.status, "pending_review");
    const before = await context.request.get(
      `${baseUrl}/articles/${article.slug}`,
    );
    // Next streaming loading boundaries may send HTTP 200 before notFound resolves.
    // Assert the actual denial screen, noindex, and absence of private content.
    const beforeHtml = await before.text();
    assert.match(beforeHtml, /这张图谱里，还没有这一页/);
    assert.match(beforeHtml, /noindex/);
    assert.ok(!beforeHtml.includes(title));
    console.log("PASS WeChat metadata import stays private until review");

    await page
      .locator('input[name="originalTitle"]')
      .fill("Agent Atlas automated editorial workflow verification");
    await page
      .locator('textarea[name="summary"]')
      .fill(
        "这是一条自动化验收记录，用于验证人工编辑、关联主题、审核发布和归档的完整流程。它不代表真实的外部研究资料。",
      );
    await page
      .locator('textarea[name="takeaways"]')
      .fill("人工审核后才能出现在公开页面\n归档后不再对外展示");
    await page.locator('input[name="audience"]').fill("维护此项目的开发者");
    await page.locator('input[name="topics"]').first().check();
    await page.locator('select[name="status"]').selectOption("published");
    await page
      .getByRole("button", { name: "保存内容与审核状态", exact: true })
      .click();
    await page.waitForURL(
      (url) =>
        url.searchParams.get("notice")?.startsWith("内容已保存") ?? false,
    );
    assert.equal(await page.locator('.notice[role="alert"]').count(), 0);
    article = await prisma.article.findUniqueOrThrow({
      where: { id: articleId },
      include: { topics: true },
    });
    assert.equal(article.status, "published");
    assert.ok(article.reviewedAt);
    assert.ok(article.topics.length > 0);
    await page.goto(`${baseUrl}/articles/${article.slug}`);
    await page.getByRole("heading", { name: title, exact: true }).waitFor();
    assert.match(await page.locator("main").innerText(), /自动化验收记录/);
    await mkdir("/tmp/agent-atlas-e2e", { recursive: true });
    await page.screenshot({
      path: "/tmp/agent-atlas-e2e/published-article.png",
      fullPage: true,
    });
    await page.goto(`${baseUrl}/explore?q=${encodeURIComponent(runId)}`);
    await page
      .getByRole("link", { name: title, exact: true })
      .first()
      .waitFor();
    console.log(
      "PASS edit, topic association, review, public article and search",
    );

    await page.goto(`${baseUrl}/admin/articles/${articleId}`);
    await page.locator('select[name="status"]').selectOption("archived");
    await page
      .getByRole("button", { name: "保存内容与审核状态", exact: true })
      .click();
    await page.waitForURL(
      (url) =>
        url.searchParams.get("notice")?.startsWith("内容已保存") ?? false,
    );
    assert.equal(
      (await prisma.article.findUniqueOrThrow({ where: { id: articleId } }))
        .status,
      "archived",
    );
    const archivedResponse = await context.request.get(
      `${baseUrl}/articles/${article.slug}`,
    );
    const archivedHtml = await archivedResponse.text();
    assert.match(archivedHtml, /这张图谱里，还没有这一页/);
    assert.match(archivedHtml, /noindex/);
    assert.ok(!archivedHtml.includes(title));
    await page.goto(`${baseUrl}/explore?q=${encodeURIComponent(runId)}`);
    assert.equal(
      await page.getByRole("link", { name: title, exact: true }).count(),
      0,
    );
    console.log("PASS archive hides article and removes search result");

    const anonymous = await browser.newContext();
    const anonymousPage = await anonymous.newPage();
    await anonymousPage.goto(`${baseUrl}/admin/articles/${articleId}`);
    await anonymousPage.waitForURL("**/admin/login");
    await anonymous.close();
    console.log("PASS anonymous editor access denied");
  } finally {
    await context.close();
    await browser.close();
    // Restrict cleanup to records created by this unique run.
    if (!articleId)
      articleId = (
        await prisma.article.findUnique({ where: { canonicalUrl: sourceUrl } })
      )?.id;
    if (articleId) {
      const jobs = await prisma.ingestionJob.findMany({
        where: { adapter: "wechat", startedAt: { gte: startedAt } },
      });
      const ids = jobs
        .filter(
          (job) =>
            job.details &&
            typeof job.details === "object" &&
            !Array.isArray(job.details) &&
            job.details.articleId === articleId,
        )
        .map((job) => job.id);
      if (ids.length)
        await prisma.ingestionJob.deleteMany({ where: { id: { in: ids } } });
      await prisma.article.deleteMany({
        where: { id: articleId, canonicalUrl: sourceUrl },
      });
    }
    if (
      sourceId &&
      !sourceIds.has(sourceId) &&
      (await prisma.article.count({ where: { sourceId } })) === 0
    )
      await prisma.source.delete({ where: { id: sourceId } });
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
