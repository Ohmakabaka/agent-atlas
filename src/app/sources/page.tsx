import Link from "next/link";
import { getSources } from "@/lib/queries";
import { date } from "@/lib/labels";
export const dynamic = "force-dynamic";
export default async function Sources() {
  const sources = await getSources();
  return (
    <main className="page-shell">
      <header className="page-intro">
        <span className="eyebrow">FOLLOW THE ORIGINAL VOICES</span>
        <h1>知识从哪里来。</h1>
        <p>
          从研究机构的原始发布，到开发者的工程记录。收录多元视角，保留每一条出处。目录中的来源可由编辑继续维护。
        </p>
      </header>
      <div className="source-grid">
        {sources.map((s) => {
          const topics = [
            ...new Map(
              s.articles.flatMap((a) =>
                a.topics.map(({ topic }) => [topic.id, topic] as const),
              ),
            ).values(),
          ];
          return (
            <article className="panel source-card" key={s.id}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span className="source-avatar">
                  {s.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="badge">{s.platform}</span>
              </div>
              <h2>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.name} ↗
                </a>
              </h2>
              <p>
                {s.description || s.organization?.name || "公开技术资料来源"}
              </p>
              <div className="tags">
                {topics.slice(0, 3).map((t) => (
                  <Link href={`/topics/${t.slug}`} key={t.id}>
                    {t.name}
                  </Link>
                ))}
              </div>
              <div className="article-footer">
                <span>{s.articles.length} 条已收录</span>
                <span>
                  {s.articles[0]
                    ? `最近 ${date(s.articles[0].createdAt)}`
                    : "待收录"}
                </span>
              </div>
              <Link
                className="button secondary"
                style={{ marginTop: 18, width: "100%" }}
                href={`/explore?source=${s.slug}`}
              >
                浏览来源资料 →
              </Link>
            </article>
          );
        })}
      </div>
    </main>
  );
}
