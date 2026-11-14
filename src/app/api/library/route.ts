import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("slugs") || "";
  if (raw.length > 10000)
    return NextResponse.json({ error: "请求过长" }, { status: 400 });
  const slugs = [
    ...new Set(
      raw.split(",").filter((s) => /^[a-z0-9][a-z0-9-]{0,179}$/.test(s)),
    ),
  ];
  if (slugs.length > 50)
    return NextResponse.json({ error: "每次最多50条" }, { status: 400 });
  const articles = await prisma.article.findMany({
    where: { slug: { in: slugs }, status: "published" },
    select: {
      slug: true,
      title: true,
      originalTitle: true,
      summary: true,
      type: true,
      layer: true,
      quality: true,
      publishedAt: true,
      source: { select: { name: true } },
      topics: { select: { topic: { select: { slug: true, name: true } } } },
    },
  });
  return NextResponse.json(
    { articles },
    { headers: { "Cache-Control": "no-store" } },
  );
}
