import test, { mock } from "node:test";
import assert from "node:assert/strict";
import https from "node:https";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  safeFetch,
  proxyHostAllowed,
  bypassProxy,
} from "../src/lib/ingestion/network";

test("proxy DNS trust is exact-host and never includes numeric destinations", () => {
  assert.equal(
    proxyHostAllowed("github.com", "github.com,raw.githubusercontent.com"),
    true,
  );
  assert.equal(proxyHostAllowed("evilgithub.com", "github.com"), false);
  assert.equal(proxyHostAllowed("github.com.evil.org", "github.com"), false);
  assert.equal(proxyHostAllowed("127.0.0.1", "127.0.0.1"), false);
  assert.equal(proxyHostAllowed("github.com", "*.com"), false);
});
test("proxy bypass follows NO_PROXY hostname boundaries and ports", () => {
  assert.equal(
    bypassProxy(new URL("https://api.example.org"), ".example.org"),
    true,
  );
  assert.equal(
    bypassProxy(new URL("https://notexample.org"), "example.org"),
    false,
  );
  assert.equal(
    bypassProxy(new URL("https://example.org"), "example.org:443"),
    true,
  );
  assert.equal(
    bypassProxy(new URL("https://example.org"), "example.org:80"),
    false,
  );
});

function respond(status: number, headers: Record<string, string>, body = "") {
  return mock.method(https, "request", ((
    _url: unknown,
    _options: unknown,
    callback: (res: unknown) => void,
  ) => {
    const request = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: (error?: Error) => void;
    };
    request.end = () => {
      queueMicrotask(() => {
        const response = Object.assign(new PassThrough(), {
          statusCode: status,
          headers,
        });
        callback(response);
        if (!response.destroyed) response.end(body);
        request.emit("close");
      });
    };
    request.destroy = (error) => {
      if (error) request.emit("error", error);
      request.emit("close");
    };
    return request;
  }) as typeof https.request);
}

test("conditional fetch returns 304 and validators without parsing a body", async () => {
  const stub = respond(304, {
    etag: '"fixture-v1"',
    "last-modified": "Mon, 01 Jan 2024 00:00:00 GMT",
  });
  try {
    const result = await safeFetch("https://8.8.8.8/feed", 0, {
      allowNotModified: true,
    });
    assert.equal(result.status, 304);
    assert.equal(result.text, "");
    assert.equal(result.etag, '"fixture-v1"');
  } finally {
    stub.mock.restore();
  }
});
test("redirects cannot escape into private addresses or downgrade HTTPS", async () => {
  for (const location of [
    "http://127.0.0.1/private",
    "https://169.254.169.254/latest",
    "http://8.8.8.8/plain",
  ]) {
    const stub = respond(302, { location });
    try {
      await assert.rejects(safeFetch("https://8.8.8.8/feed"));
    } finally {
      stub.mock.restore();
    }
  }
});
test("credential-bearing redirect and oversized responses fail closed", async () => {
  let stub = respond(302, { location: "https://8.8.4.4/next" });
  try {
    await assert.rejects(
      safeFetch("https://8.8.8.8/feed", 0, {
        headers: { authorization: "test-only" },
      }),
      /凭证/,
    );
  } finally {
    stub.mock.restore();
  }
  stub = respond(200, { "content-length": "3000000" });
  try {
    await assert.rejects(safeFetch("https://8.8.8.8/feed"), /2 MB/);
  } finally {
    stub.mock.restore();
  }
});
