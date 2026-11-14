import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { siteOrigin } from "@/lib/search/seo";
import { buildFeed } from "@/lib/feed";
export const dynamic = "force-dynamic";
export async function GET() {
  const origin = siteOrigin();
  if (!origin)
    return NextResponse.json(
      { error: "站点尚未配置公开地址，订阅暂不可用。" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  const articles = await prisma.article.findMany({
    where: { status: "published" },
    select: {
      slug: true,
      title: true,
      summary: true,
      updatedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return new Response(buildFeed(origin, articles), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
