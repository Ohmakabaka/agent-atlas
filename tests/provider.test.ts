import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initializeDatabase } from "./helpers/database";
import type { RequestOptions } from "../src/lib/ingestion/network";
const draft = {
  titleSuggestion: "有依据的中文标题",
  summaryDraft: "草稿需要人工核对原始资料。",
  keywords: ["MCP"],
  takeaways: [],
  engineeringCase: null,
};

test("OpenAI-compatible provider sends structured metadata and validates the response protocol", async () => {
  const { OpenAICompatibleProvider } = await import("../src/lib/ai");
  let captured: RequestOptions | undefined;
  const provider = new OpenAICompatibleProvider(
    {
      apiKey: "fixture-token",
      baseUrl: "https://model.example.org/v1/",
      model: "fixture-model",
    },
    async (url, _redirects, options) => {
      assert.equal(url, "https://model.example.org/v1/chat/completions");
      captured = options;
      return {
        url,
        status: 200,
        text: JSON.stringify({
          choices: [{ message: { content: JSON.stringify(draft) } }],
        }),
        contentType: "application/json",
      };
    },
  );
  assert.deepEqual(
    await provider.generate({
      title: "Research",
      originalTitle: "Research",
      sourceUrl: "https://example.org/research",
      description: "Metadata, not full text.",
    }),
    draft,
  );
  assert.equal(captured?.method, "POST");
  assert.equal(captured?.headers?.Authorization, "Bearer fixture-token");
  const body = JSON.parse(captured?.body || "{}");
  assert.equal(body.model, "fixture-model");
  assert.equal(body.response_format.type, "json_object");
  assert.equal(
    JSON.parse(body.messages[1].content).description,
    "Metadata, not full text.",
  );
  const malformed = new OpenAICompatibleProvider(
    {
      apiKey: "fixture-token",
      baseUrl: "https://model.example.org/v1",
      model: "fixture",
    },
    async (url) => ({
      url,
      status: 200,
      text: '{"choices":[{"message":{"content":"{\\"unexpected\\":true}"}}]}',
      contentType: "application/json",
    }),
  );
  await assert.rejects(
    malformed.generate({
      title: "x",
      originalTitle: "x",
      sourceUrl: "https://example.org",
      description: "",
    }),
  );
  const insecure = new OpenAICompatibleProvider({
    apiKey: "fixture-token",
    baseUrl: "http://model.example.org/v1",
    model: "fixture",
  });
  await assert.rejects(
    insecure.generate({
      title: "x",
      originalTitle: "x",
      sourceUrl: "https://example.org",
      description: "",
    }),
    /HTTPS/,
  );
});

test("generated draft stays separate from reviewed content and preserves topic suggestions", async () => {
  // An isolated database and protocol transport exercise the real draft-saving operation.
  const directory = await mkdtemp(join(tmpdir(), "atlas-provider-"));
  const { createDb } = await import("../src/lib/db");
  const url = `file:${join(directory, "test.db")}`;
  await initializeDatabase(url);
  const db = createDb(url);
  try {
    const article = await db.article.create({
      data: {
        slug: "provider-fixture",
        title: "人工审核标题",
        originalTitle: "Original",
        summary: "人工审核后的正文应保留。",
        url: "https://example.org/provider",
        canonicalUrl: "https://example.org/provider",
        status: "published",
        aiDraft: { topicSuggestions: [{ id: "topic" }] },
        rawMetadata: { description: "元信息" },
      },
    });
    const { OpenAICompatibleProvider } = await import("../src/lib/ai");
    const provider = new OpenAICompatibleProvider(
      {
        apiKey: "fixture-token",
        baseUrl: "https://model.example.org/v1",
        model: "fixture",
      },
      async (endpoint) => ({
        url: endpoint,
        status: 200,
        text: JSON.stringify({
          choices: [{ message: { content: JSON.stringify(draft) } }],
        }),
        contentType: "application/json",
      }),
    );
    const { generateDraft } = await import("../src/lib/ai");
    const result = await generateDraft(article.id, provider, db);
    assert.equal(result.available, true);
    const saved = await db.article.findUniqueOrThrow({
      where: { id: article.id },
    });
    assert.equal(saved.summary, article.summary);
    assert.equal(saved.title, article.title);
    assert.equal(saved.status, "published");
    assert.equal((saved.aiDraft as Record<string, unknown>).reviewed, false);
  } finally {
    await db.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});
