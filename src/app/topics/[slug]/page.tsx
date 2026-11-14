import Link from "next/link";
import type { Metadata } from "next";
import { cache } from "react";
import { canonicalPath, siteOrigin } from "@/lib/search/seo";
import { relationLabels } from "@/lib/search/relations";
import { notFound } from "next/navigation";
import { getTopic } from "@/lib/queries";
import { strings, layers } from "@/lib/labels";
import { ArticleCard } from "@/components/article-card";
export const dynamic = "force-dynamic";
const loadTopic = cache(getTopic);
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const topic = await loadTopic((await params).slug);
  return topic
    ? {
        title: topic.name,
        description: topic.description.slice(0, 170),
        ...(siteOrigin()
          ? { alternates: { canonical: canonicalPath("topics", topic.slug) } }
          : {}),
        openGraph: {
          title: topic.name,
          description: topic.description.slice(0, 170),
          locale: "zh_CN",
          type: "website",
        },
      }
    : { title: "主题未找到", robots: { index: false, follow: false } };
}
export default async function TopicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await loadTopic(slug);
  if (!t) notFound();
  const groups = ["primary", "community", "engineering"];
  return (
    <main className="page-shell">
      <div className="breadcrumb">
        <Link href="/">技术地图</Link>
        <span>/</span>
        {t.parent && (
          <>
            <Link href={`/topics/${t.parent.slug}`}>{t.parent.name}</Link>
            <span>/</span>
          </>
        )}
        {t.name}
      </div>
      <header className="page-intro">
        <span className="eyebrow">TOPIC / {t.englishName}</span>
        <h1>{t.name}</h1>
        <p>{t.description}</p>
        <div className="tags" style={{ marginTop: 18 }}>
          {t.children.map((c) => (
            <Link key={c.id} href={`/topics/${c.slug}`}>
              {c.name}
            </Link>
          ))}
        </div>
      </header>
      <div className="two-column">
        <div>
          <section className="panel">
            <span className="eyebrow">THE QUESTION</span>
            <h2 style={{ marginTop: 10 }}>{t.question}</h2>
            <div className="tags">
              {strings(t.concepts).map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          </section>
          <section className="panel">
            <h2>推荐阅读路径</h2>
            <p className="muted" style={{ fontSize: 12 }}>
              从概念入门到工程实践；次序是编辑建议，不代表历史依赖。
            </p>
            {(t.readingPathArticles.length
              ? t.readingPathArticles
              : t.articles.slice(0, 3)
            ).map((a, i) => (
              <Link
                className="reading-step"
                key={a.id}
                href={`/articles/${a.slug}`}
              >
                <span className="step-number">{i + 1}</span>
                <div>
                  <strong>{a.title} ↗</strong>
                  <p>{a.summary}</p>
                </div>
              </Link>
            ))}
            {!t.articles.length && (
              <p className="notice">
                这个主题正在建设中。你可以通过 GitHub 贡献资料线索。
              </p>
            )}
          </section>
          {groups.map((layer) => {
            const items = t.articles.filter((a) => a.layer === layer);
            return (
              <section key={layer}>
                <div className="section-heading">
                  <h2>
                    {layers[layer]}{" "}
                    <span className="badge">{items.length}</span>
                  </h2>
                </div>
                <div className="article-list">
                  {items.map((a) => (
                    <ArticleCard key={a.id} article={a} />
                  ))}
                </div>
                {!items.length && (
                  <div className="panel muted" style={{ fontSize: 12 }}>
                    尚未收录经过审核的{layers[layer]}
                    。欢迎补充可核实的原始链接。
                  </div>
                )}
              </section>
            );
          })}
          {t.articles.some((a) => a.type === "repository") && (
            <section className="panel" style={{ marginTop: 25 }}>
              <h2>相关开源实现</h2>
              {t.articles
                .filter((a) => a.type === "repository")
                .map((a) => (
                  <Link
                    className="reading-step"
                    key={a.id}
                    href={`/articles/${a.slug}`}
                  >
                    {a.title} ↗
                  </Link>
                ))}
            </section>
          )}
        </div>
        <aside>
          <div className="panel">
            <h3>主题速览</h3>
            <dl className="metadata-list">
              <div>
                <dt>公开资料</dt>
                <dd>{t.articles.length}</dd>
              </div>
              <div>
                <dt>细分主题</dt>
                <dd>{t.children.length}</dd>
              </div>
              <div>
                <dt>阅读方式</dt>
                <dd>中文导读 + 原文</dd>
              </div>
            </dl>
            <Link
              className="button secondary"
              style={{ marginTop: 20, width: "100%" }}
              href={`/explore?topic=${t.slug}`}
            >
              筛选本主题资料 →
            </Link>
            <Link
              href={`/timeline?topic=${t.slug}`}
              style={{
                display: "block",
                textAlign: "center",
                marginTop: 14,
                fontSize: 12,
              }}
            >
              查看技术演进 ↗
            </Link>
            <Link
              href={`/graph?topic=${t.slug}`}
              style={{
                display: "block",
                textAlign: "center",
                marginTop: 14,
                fontSize: 12,
              }}
            >
              探索知识关系图 ↗
            </Link>
          </div>
          <div className="panel">
            <h3>知识连接</h3>
            <p className="muted" style={{ fontSize: 11 }}>
              仅展示已确认的关系；主题相近不等于技术继承。
            </p>
            {[
              ...t.outgoing.map((r) => ({
                id: r.id,
                type: r.type,
                topic: r.toTopic,
                article: r.toArticle,
                description: r.description,
                evidence: r.evidenceUrl,
                direction: "出向",
              })),
              ...t.incoming.map((r) => ({
                id: r.id,
                type: r.type,
                topic: r.fromTopic,
                article: r.fromArticle,
                description: r.description,
                evidence: r.evidenceUrl,
                direction: "入向",
              })),
            ].map((r) => (
              <div className="relation" key={r.id}>
                <div className="relation-label">
                  {relationLabels[r.type] || r.type} · {r.direction} · 已确认
                </div>
                {r.topic ? (
                  <Link href={`/topics/${r.topic.slug}`}>
                    {r.topic.name} ↗
                  </Link>
                ) : r.article ? (
                  <Link href={`/articles/${r.article.slug}`}>
                    {r.article.title} ↗
                  </Link>
                ) : null}
                <p className="muted" style={{ fontSize: 11, marginTop: 5 }}>
                  {r.description}
                </p>
                {r.evidence && (
                  <a
                    style={{ fontSize: 10, color: "var(--accent)" }}
                    href={r.evidence}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    查看依据 ↗
                  </a>
                )}
              </div>
            ))}
            {!t.outgoing.length && !t.incoming.length && (
              <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                暂无已审核关系。
              </p>
            )}
          </div>
          <div className="panel">
            <h3>最近收录</h3>
            {t.articles.slice(0, 3).map((a) => (
              <Link
                key={a.id}
                href={`/articles/${a.slug}`}
                className="reading-step"
              >
                <strong>{a.title}</strong>
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
