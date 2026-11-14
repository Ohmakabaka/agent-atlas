import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

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
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(base);
    await expect(
      page.getByRole("heading", { name: "把概念用起来" }),
    ).toBeVisible();
    await page.getByRole("link", { name: /阅读全部指南/ }).click();
    await expect(page.locator(".article-card")).toHaveCount(6);
    await page.goto(`${base}/articles/atlas-context-budget`);
    const body = page.getByRole("region", { name: "原创指南正文" });
    await expect(body).toBeVisible();
    assert((await body.innerText()).length > 1000);
    await expect(
      page.getByText("Codex 辅助创作", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("尚未人工复核", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "核查资料" })).toBeVisible();
    const json = JSON.parse(
      await page.locator('script[type="application/ld+json"]').innerText(),
    );
    assert.equal(json.author.name, "Agent Atlas · Codex 辅助整理");
    assert(Array.isArray(json.isBasedOn) && json.isBasedOn.length >= 3);
    assert(
      json.isBasedOn.every((reference: { url: string }) =>
        reference.url.startsWith("https://github.com/"),
      ),
    );
    await page.getByRole("button", { name: "收藏资料", exact: true }).click();
    await page.goto(`${base}/library`);
    await expect(
      page.getByRole("link", { name: /上下文/ }).first(),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/articles/atlas-mcp-tool-boundaries`);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: "docs/screenshots/guide-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/articles/atlas-context-budget`);
    await page.screenshot({
      path: "docs/screenshots/guide.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS six original guides, public evidence and Codex attribution, readable body, bookmarks and mobile layout",
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
