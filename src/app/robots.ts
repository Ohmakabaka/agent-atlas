export const dynamic = "force-dynamic";
import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/search/seo";
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/library"],
    },
    ...(origin ? { sitemap: origin + "/sitemap.xml" } : {}),
  };
}
