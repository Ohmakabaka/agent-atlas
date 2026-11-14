import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { siteOrigin } from "@/lib/search/seo";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  if (!origin) return [];
  const [topics, articles] = await Promise.all([
    prisma.topic.findMany({ select: { slug: true } }),
    prisma.article.findMany({
      where: { status: "published" },
      select: { slug: true, updatedAt: true },
      take: 45000,
    }),
  ]);
  return [
    ...["/", "/explore", "/sources", "/timeline", "/graph"].map((path) => ({
      url: origin + path,
    })),
    ...topics.map((t) => ({
      url: origin + "/topics/" + encodeURIComponent(t.slug),
    })),
    ...articles.map((a) => ({
      url: origin + "/articles/" + encodeURIComponent(a.slug),
      lastModified: a.updatedAt,
    })),
  ];
}
