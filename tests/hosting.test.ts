import test from "node:test";
import assert from "node:assert/strict";
import { siteOrigin, canonicalPath } from "../src/lib/search/seo";

test("Render's runtime origin enables canonical URLs and an explicit custom domain takes precedence", () => {
  const previous = {
    SITE_URL: process.env.SITE_URL,
    RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL,
  };
  try {
    delete process.env.SITE_URL;
    process.env.RENDER_EXTERNAL_URL = "https://agent-atlas-example.onrender.com";
    assert.equal(siteOrigin(), process.env.RENDER_EXTERNAL_URL);
    assert.equal(
      canonicalPath("articles", "react"),
      "https://agent-atlas-example.onrender.com/articles/react",
    );
    process.env.SITE_URL = "https://knowledge.example.org/";
    assert.equal(siteOrigin(), "https://knowledge.example.org");
    // Invalid explicit configuration must not silently publish another origin.
    process.env.SITE_URL = "https://user:secret@knowledge.example.org";
    assert.equal(siteOrigin(), undefined);
    process.env.SITE_URL = "javascript:alert(1)";
    assert.equal(siteOrigin(), undefined);
    process.env.SITE_URL = " ";
    assert.equal(siteOrigin(), process.env.RENDER_EXTERNAL_URL);
    delete process.env.RENDER_EXTERNAL_URL;
    assert.equal(siteOrigin(), undefined);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
