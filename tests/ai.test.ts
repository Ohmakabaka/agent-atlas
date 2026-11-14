import test from "node:test";
import assert from "node:assert/strict";
import { configuredProvider, draftSchema, generateDraft } from "../src/lib/ai";

test("no API key degrades to manual editing without touching content", async () => {
  const old = process.env.AI_API_KEY;
  delete process.env.AI_API_KEY;
  try {
    assert.equal(configuredProvider(), null);
    const result = await generateDraft("no-database-needed");
    assert.equal(result.available, false);
    assert.match(result.message, /手动编辑/);
  } finally {
    if (old === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = old;
  }
});

test("model output requires bounded structured draft fields", () => {
  assert.equal(
    draftSchema.safeParse({
      titleSuggestion: "中文标题",
      summaryDraft: "仅基于元数据",
      keywords: ["MCP"],
      takeaways: [],
    }).success,
    true,
  );
  assert.equal(
    draftSchema.safeParse({ summary: "wrong schema" }).success,
    false,
  );
  assert.equal(
    draftSchema.safeParse({
      titleSuggestion: "x".repeat(501),
      summaryDraft: "",
      keywords: [],
      takeaways: [],
    }).success,
    false,
  );
});
