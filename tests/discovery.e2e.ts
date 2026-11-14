import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";

async function main() {
  const base = process.env.BASE_URL || "http://127.0.0.1:3000";
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync("/usr/bin/chromium")
        ? "/usr/bin/chromium"
        : chromium.executablePath()),
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${base}/explore?q=Agent`);
    await expect(page.locator('select[name="sort"]')).toHaveValue("relevance");
    await page.locator('select[name="sort"]').selectOption("oldest");
    await page.getByRole("button", { name: "应用筛选" }).click();
    await expect(page).toHaveURL(/sort=oldest/);
    assert((await page.locator(".article-card").count()) > 0);
    await page.goto(`${base}/timeline?topic=architecture&type=paper`);
    assert((await page.locator(".article-card").count()) > 0);
    await expect(page.locator('select[name="type"]')).toHaveValue("paper");
    for (const card of await page.locator(".article-card").all())
      await expect(card).toContainText("研究论文");
    console.log("PASS search sorting and timeline filters");
    await page.goto(`${base}/graph`);
    await expect(
      page.getByRole("heading", { name: "每一条连接，都有依据。" }),
    ).toBeVisible();
    const value = await page
      .locator("#graph-node option")
      .nth(1)
      .getAttribute("value");
    assert(value);
    await page.locator("#graph-node").selectOption(value);
    await expect(page.getByRole("button", { name: "清除聚焦" })).toBeVisible();
    assert((await page.locator('svg [aria-pressed="true"]').count()) === 1);
    await page.getByRole("button", { name: "证据列表", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "查看关系依据 ↗" }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "清除聚焦" }).click();
    await page.getByRole("button", { name: "关系图", exact: true }).click();
    await mkdir("docs/screenshots", { recursive: true });
    await page.screenshot({
      path: "docs/screenshots/graph.png",
      fullPage: true,
    });
    await page.goto(`${base}/graph?topic=not-a-real-topic`);
    await expect(
      page.getByRole("heading", { name: "还没有符合条件的已确认关系" }),
    ).toBeVisible();
    console.log("PASS graph node focus, evidence view, filter empty state");
    await page.goto(`${base}/articles/swe-bench`);
    await expect(page).toHaveTitle(/SWE-bench/);
    const canonical = await page.locator('link[rel="canonical"]').count();
    if (canonical)
      assert(
        (
          await page.locator('link[rel="canonical"]').getAttribute("href")
        )?.endsWith("/articles/swe-bench"),
      );
    const data = JSON.parse(
      await page.locator('script[type="application/ld+json"]').innerText(),
    );
    assert.equal(data["@type"], "Article");
    assert.equal(data.author.name, "Agent Atlas 编辑");
    await page.getByRole("button", { name: "收藏资料", exact: true }).click();
    await page.getByRole("button", { name: "标记已读", exact: true }).click();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "已收藏", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: "已读", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.goto(`${base}/library`);
    await expect(
      page.getByRole("link", { name: /SWE-bench/ }).first(),
    ).toBeVisible();
    console.log("PASS article SEO and persistent reading library");
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of [
      "/graph",
      "/library",
      "/timeline?type=paper",
      "/explore?q=评测&sort=relevance",
    ]) {
      await page.goto(base + route);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `mobile overflow: ${route}`,
      );
    }
    assert.deepEqual(errors, []);
    console.log("PASS responsive discovery pages without runtime errors");
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
