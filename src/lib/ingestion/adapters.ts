import * as cheerio from "cheerio";
import Parser from "rss-parser";
import { parse } from "csv-parse/sync";
import { safeFetch, validatePublicUrl } from "./network";
import { canonicalizeUrl } from "./normalize";

export interface ImportMetadata {
  title?: string;
  originalTitle?: string;
  summary?: string;
  authorName?: string;
  sourceId?: string;
  publishedAt?: string;
  language?: string;
  layer?: string;
  type?: string;
  canonicalUrl?: string;
}
export interface DiscoveredItem extends ImportMetadata {
  url: string;
  description?: string;
  sourceName?: string;
  canonicalSuggestion?: string;
  adapter: string;
}
export interface SourceAdapter<Input = string> {
  name: string;
  discover(input: Input): Promise<DiscoveredItem[]>;
}

export function extractMetadata(
  html: string,
  responseUrl: string,
  input = responseUrl,
): DiscoveredItem {
  const $ = cheerio.load(html);
  const meta = (name: string) =>
    $(`meta[property="${name}"],meta[name="${name}"]`)
      .first()
      .attr("content")
      ?.trim();
  const title = (meta("og:title") || $("title").first().text())
    .trim()
    .slice(0, 500);
  const canonical = $('link[rel="canonical"]').attr("href");
  let canonicalUrl = canonicalizeUrl(responseUrl);
  let canonicalSuggestion: string | undefined;
  if (canonical) {
    try {
      const candidate = canonicalizeUrl(new URL(canonical, responseUrl).href);
      if (new URL(candidate).origin === new URL(responseUrl).origin)
        canonicalUrl = candidate;
      else canonicalSuggestion = candidate;
    } catch {
      /* Ignore unsafe canonical metadata. */
    }
  }
  return {
    adapter: new URL(input).hostname === "mp.weixin.qq.com" ? "wechat" : "url",
    url: input,
    canonicalUrl,
    canonicalSuggestion,
    title: title || undefined,
    originalTitle: title || undefined,
    description: (meta("description") || meta("og:description") || "").slice(
      0,
      2000,
    ),
    authorName: meta("author")?.slice(0, 200),
    publishedAt: meta("article:published_time"),
    language: ($("html").attr("lang") || "en").startsWith("zh") ? "zh" : "en",
    sourceName: meta("og:site_name")?.slice(0, 200),
  };
}
export const urlAdapter: SourceAdapter = {
  name: "url",
  async discover(input) {
    const response = await safeFetch(input);
    if (response.contentType && !/html|xml|text/i.test(response.contentType))
      throw new Error("该来源不是 HTML 页面，请手动填写元数据");
    return [extractMetadata(response.text, response.url, input)];
  },
};

/** WeChat is a manual link + metadata workflow; no unofficial scraping dependency. */
export const wechatAdapter: SourceAdapter = {
  name: "wechat",
  async discover(input) {
    const url = validatePublicUrl(input);
    if (url.hostname !== "mp.weixin.qq.com")
      throw new Error("公众号链接应来自 mp.weixin.qq.com");
    return [
      {
        url: url.href,
        adapter: "wechat",
        language: "zh",
        layer: "community",
        sourceName: "微信公众号",
      },
    ];
  },
};

export async function parseFeed(xml: string): Promise<DiscoveredItem[]> {
  if (Buffer.byteLength(xml, "utf8") > 2 * 1024 * 1024)
    throw new Error("Feed 超过 2 MB 限制");
  const parser = new Parser();
  const feed = await parser.parseString(xml);
  return feed.items.slice(0, 50).flatMap((item) => {
    if (!item.link) return [];
    try {
      validatePublicUrl(item.link);
    } catch {
      return [];
    }
    return [
      {
        adapter: "rss",
        url: item.link,
        title: item.title?.slice(0, 500),
        originalTitle: item.title?.slice(0, 500),
        description: (item.contentSnippet || item.summary || "").slice(0, 2000),
        authorName: item.creator?.slice(0, 200),
        publishedAt: item.isoDate || item.pubDate,
        sourceName: feed.title?.slice(0, 200),
      },
    ];
  });
}
export const rssAdapter: SourceAdapter = {
  name: "rss",
  async discover(input) {
    return parseFeed((await safeFetch(input)).text);
  },
};

export const githubAdapter: SourceAdapter = {
  name: "github",
  async discover(input) {
    const url = validatePublicUrl(input);
    const segments = url.pathname.split("/").filter(Boolean);
    if (
      url.hostname !== "github.com" ||
      segments.length !== 2 ||
      !segments.every((x) => /^[\w.-]+$/.test(x))
    ) {
      throw new Error("请输入 GitHub 仓库根地址");
    }
    // Public HTML metadata works without API credentials or API rate-limit requirements.
    const [item] = await urlAdapter.discover(url.href);
    return [
      {
        ...item,
        adapter: "github",
        type: "repository",
        authorName: segments[0],
        sourceName: "GitHub",
      },
    ];
  },
};

export function parseBatch(
  text: string,
  format: "json" | "csv",
): DiscoveredItem[] {
  if (Buffer.byteLength(text, "utf8") > 1024 * 1024)
    throw new Error("批量导入最多 1 MB");
  const records: unknown =
    format === "json"
      ? JSON.parse(text)
      : parse(text, {
          columns: true,
          skip_empty_lines: true,
          bom: true,
          max_record_size: 16_384,
        });
  if (!Array.isArray(records)) throw new Error("JSON 须为条目数组");
  if (records.length > 100) throw new Error("每批最多 100 条");
  return records.map((value, i) => {
    if (
      !value ||
      typeof value !== "object" ||
      !("url" in value) ||
      typeof value.url !== "string"
    )
      throw new Error(`第 ${i + 1} 行缺少 URL`);
    const obj = value as Record<string, unknown>;
    const item: DiscoveredItem = { url: obj.url as string, adapter: format };
    for (const key of [
      "title",
      "originalTitle",
      "summary",
      "authorName",
      "sourceId",
      "publishedAt",
      "language",
      "layer",
      "type",
      "canonicalUrl",
    ] as const) {
      if (typeof obj[key] === "string")
        item[key] = obj[key].slice(0, key === "summary" ? 20_000 : 2_000);
    }
    return item;
  });
}
