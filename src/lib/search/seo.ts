import type { Metadata } from "next";
import { editorialProvenance, EDITORIAL_AUTHOR } from "../editorial/schema";

export function siteOrigin() {
  // Render supplies this at runtime, so the first deployment has working
  // canonical URLs and feeds before a custom domain is configured.
  const configured =
    process.env.SITE_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim();
  if (!configured) return undefined;
  try {
    const url = new URL(configured);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
export function canonicalPath(kind: "articles" | "topics", slug: string) {
  const path = `/${kind}/${encodeURIComponent(slug)}`;
  const origin = siteOrigin();
  return origin ? new URL(path, origin).href : path;
}
export function escapeJsonLd(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
type EditorialArticle = {
  slug: string;
  title: string;
  originalTitle: string;
  summary: string;
  url: string;
  authorName: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  rawMetadata?: unknown;
};
export function articleMetadata(article: EditorialArticle): Metadata {
  return {
    title: article.title,
    description: article.summary.slice(0, 170),
    ...(siteOrigin()
      ? { alternates: { canonical: canonicalPath("articles", article.slug) } }
      : {}),
    openGraph: {
      type: "article",
      title: article.title,
      description: article.summary.slice(0, 170),
      publishedTime: article.createdAt.toISOString(),
      modifiedTime: article.updatedAt.toISOString(),
      locale: "zh_CN",
      siteName: "Agent Atlas",
      ...(siteOrigin() ? { url: canonicalPath("articles", article.slug) } : {}),
    },
    twitter: {
      card: "summary",
      title: article.title,
      description: article.summary.slice(0, 170),
    },
  };
}
export function articleJsonLd(article: EditorialArticle) {
  const editorial = editorialProvenance(article.rawMetadata);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.summary.slice(0, 5000),
    inLanguage: "zh-CN",
    author: {
      "@type": "Organization",
      name: editorial ? EDITORIAL_AUTHOR : "Agent Atlas 编辑",
    },
    publisher: { "@type": "Organization", name: "Agent Atlas" },
    datePublished: article.createdAt.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    ...(siteOrigin()
      ? { mainEntityOfPage: canonicalPath("articles", article.slug) }
      : {}),
    isBasedOn: editorial
      ? editorial.references.map((reference) => ({
          "@type": "CreativeWork",
          name: reference.title,
          url: reference.url,
        }))
      : {
          "@type": "CreativeWork",
          name: article.originalTitle,
          url: article.url,
          ...(article.authorName
            ? { author: { "@type": "Person", name: article.authorName } }
            : {}),
          ...(article.publishedAt
            ? { datePublished: article.publishedAt.toISOString() }
            : {}),
        },
  };
}
