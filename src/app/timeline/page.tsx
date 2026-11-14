import { getTimeline } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { ArticleCard } from "@/components/article-card";
import { date, types } from "@/lib/labels";
import type { Metadata } from "next";
import { siteOrigin } from "@/lib/search/seo";
export const metadata: Metadata = {
  title: "技术演进",
  description: "按原始发布时间探索Agent论文、协议与工程实践。",
  ...(siteOrigin()
    ? { alternates: { canonical: `${siteOrigin()}/timeline` } }
    : {}),
};
export const dynamic = "force-dynamic";
export default async function Timeline({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; type?: string }>;
}) {
  const params = await searchParams;
  const topic = typeof params.topic === "string" ? params.topic : undefined;
  const type =
    typeof params.type === "string" && Object.hasOwn(types, params.type)
      ? params.type
      : undefined;
  const [articles, topics] = await Promise.all([
    getTimeline(topic, type),
    prisma.topic.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  return (
    <main className="page-shell">
      <header className="page-intro">
        <span className="eyebrow">TRACING THE EVOLUTION</span>
        <h1>看见技术演进的脉络。</h1>
        <p>
          沿着论文、协议和工程实践的公开发布时间，回顾 Agent
          的发展。时间顺序仅提供浏览线索，不自动推断技术继承关系。
        </p>
      </header>
      <form
        className="search-large"
        action="/timeline"
        style={{ maxWidth: 740, flexWrap: "wrap" }}
      >
        <label className="field" style={{ flex: 1 }}>
          聚焦一个技术主题
          <select name="topic" defaultValue={topic || ""}>
            <option value="">全部技术主题</option>
            {topics.map((t) => (
              <option value={t.slug} key={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: 1 }}>
          内容类型
          <select name="type" defaultValue={type || ""}>
            <option value="">全部类型</option>
            {Object.entries(types).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="button" style={{ alignSelf: "end" }} type="submit">
          查看演进
        </button>
      </form>
      <p className="results-count">
        共 {articles.length} 条有明确发布日期的资料 ·
        未知日期的内容仍可在探索资料中查找
      </p>
      <div className="timeline">
        {articles.map((a) => (
          <div className="timeline-item" key={a.id}>
            <time className="timeline-date">{date(a.publishedAt)}</time>
            <ArticleCard article={a} />
          </div>
        ))}
        {!articles.length && (
          <div className="panel empty-state">
            <h2>这个主题的时间线正在建设中</h2>
            <p>审核发布带有发布日期的资料后，会自动呈现在这里。</p>
          </div>
        )}
      </div>
    </main>
  );
}
