export function xmlEscape(value: string) {
  return value.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
}
export function buildFeed(
  origin: string,
  articles: {
    slug: string;
    title: string;
    summary: string;
    updatedAt: Date;
    createdAt: Date;
  }[],
) {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Agent Atlas · 已审核中文导读</title><link>${xmlEscape(origin)}</link><description>AI Agent 技术演进与工程实践，保留原始出处。</description><language>zh-CN</language><atom:link href="${xmlEscape(origin)}/feed.xml" rel="self" type="application/rss+xml"/>${articles
    .map((a) => {
      const url = origin + "/articles/" + encodeURIComponent(a.slug);
      return `<item><title>${xmlEscape(a.title)}</title><link>${xmlEscape(url)}</link><guid isPermaLink="true">${xmlEscape(url)}</guid><description>${xmlEscape(a.summary)}</description><pubDate>${a.createdAt.toUTCString()}</pubDate></item>`;
    })
    .join("")}</channel></rss>`;
}
