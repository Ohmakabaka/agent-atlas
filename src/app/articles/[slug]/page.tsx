import Link from "next/link";
import type { Metadata } from "next";
import { cache } from "react";
import { articleMetadata, articleJsonLd, escapeJsonLd } from "@/lib/search/seo";
import { relationLabels } from "@/lib/search/relations";
import { ReadingControls } from "@/components/reading-controls";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import { getArticle } from "@/lib/queries";
import { date, layers, types, strings } from "@/lib/labels";
import { ArticleCard } from "@/components/article-card";
export const dynamic = "force-dynamic";
const loadArticle = cache(getArticle);
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const article = await loadArticle((await params).slug);
  return article
    ? articleMetadata(article)
    : { title: "资料未找到", robots: { index: false, follow: false } };
}
export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const a = await loadArticle(slug);
  if (!a) notFound();
  return (
    <main className="page-shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: escapeJsonLd(articleJsonLd(a)) }}
      />
      <div className="breadcrumb">
        <Link href="/explore">探索资料</Link>
        <span>/</span>
        {types[a.type]}
      </div>
      <header className="page-intro">
        <div className="article-meta">
          <span className={`layer ${a.layer}`}>{layers[a.layer]}</span>
          <span>{types[a.type]}</span>
          <span>已审核</span>
        </div>
        <h1 style={{ maxWidth: 930 }}>{a.title}</h1>
        <p className="subtitle" lang="en">
          {a.originalTitle}
        </p>
        <div className="tags" style={{ marginTop: 18 }}>
          {a.topics.map(({ topic: t }) => (
            <Link key={t.id} href={`/topics/${t.slug}`}>
              {t.name}
            </Link>
          ))}
        </div>
        <ReadingControls article={{ slug: a.slug, title: a.title }} />
      </header>
      <div className="two-column">
        <div>
          <section className="panel">
            <span className="eyebrow">EDITORIAL GUIDE</span>
            <h2 style={{ marginTop: 10 }}>中文导读</h2>
            <div className="prose">
              <Markdown>{a.summary}</Markdown>
            </div>
            <div className="notice">
              这是独立撰写的中文导读，不是原文全文翻译。具体技术表述、实验设置及结论，请以原始资料为准。
            </div>
            <a
              className="button"
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              阅读原始资料 ↗
            </a>
          </section>
          <section className="panel">
            <h2>技术要点</h2>
            <ul className="prose" style={{ paddingLeft: 20 }}>
              {strings(a.takeaways).map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            {!strings(a.takeaways).length && (
              <p className="muted">暂无补充要点，请参阅原文。</p>
            )}
          </section>
          <section className="panel">
            <h2>适合谁读</h2>
            <p className="prose">
              {a.audience || "关注这一技术主题的开发者与研究者。"}
            </p>
          </section>
          {a.engineeringCase && (
            <section className="panel">
              <h2>工程案例拆解</h2>
              {[
                ["问题", a.engineeringCase.problem],
                ["架构", a.engineeringCase.architecture],
                ["方案", a.engineeringCase.solution],
                ["效果与边界", a.engineeringCase.outcome],
              ].map(([label, text]) => (
                <div key={label} style={{ marginTop: 17 }}>
                  <h3>{label}</h3>
                  <p className="prose">{text}</p>
                </div>
              ))}
              <a
                href={a.engineeringCase.evidenceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)", fontSize: 12 }}
              >
                查看案例依据 ↗
              </a>
            </section>
          )}
          <div className="section-heading">
            <div>
              <h2>继续探索</h2>
              <p>以下资料共享技术主题，不代表彼此直接引用。</p>
            </div>
          </div>
          <div className="article-list">
            {a.related.map((r) => (
              <ArticleCard key={r.id} article={r} />
            ))}
          </div>
        </div>
        <aside>
          <div className="panel">
            <h3>资料档案</h3>
            <dl className="metadata-list">
              <div>
                <dt>作者</dt>
                <dd>{a.authorName || "未标注"}</dd>
              </div>
              <div>
                <dt>机构</dt>
                <dd>{a.organization?.name || "未标注"}</dd>
              </div>
              <div>
                <dt>来源</dt>
                <dd>{a.source?.name || "独立来源"}</dd>
              </div>
              <div>
                <dt>发布</dt>
                <dd>{date(a.publishedAt)}</dd>
              </div>
              <div>
                <dt>语言</dt>
                <dd>
                  {a.language === "zh"
                    ? "中文"
                    : a.language === "en"
                      ? "英文"
                      : a.language}
                </dd>
              </div>
              <div>
                <dt>收录</dt>
                <dd>{date(a.createdAt)}</dd>
              </div>
              <div>
                <dt>审核</dt>
                <dd>{date(a.reviewedAt)}</dd>
              </div>
            </dl>
          </div>
          <div className="panel">
            <h3>内容关系</h3>
            {[
              ...a.outgoing.map((r) => ({
                id: r.id,
                type: r.type,
                article: r.toArticle,
                topic: r.toTopic,
                description: r.description,
                evidence: r.evidenceUrl,
                direction: "出向",
              })),
              ...a.incoming.map((r) => ({
                id: r.id,
                type: r.type,
                article: r.fromArticle,
                topic: r.fromTopic,
                description: r.description,
                evidence: r.evidenceUrl,
                direction: "入向",
              })),
            ].map((r) => (
              <div className="relation" key={r.id}>
                <p className="relation-label">
                  {relationLabels[r.type] || r.type} · {r.direction} · 已确认
                </p>
                {r.article && (
                  <Link href={`/articles/${r.article.slug}`}>
                    {r.article.title} ↗
                  </Link>
                )}
                {r.topic && (
                  <Link href={`/topics/${r.topic.slug}`}>
                    {r.topic.name} ↗
                  </Link>
                )}
                <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                  {r.description}
                </p>
                {r.evidence && (
                  <a
                    href={r.evidence}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 11, color: "var(--accent)" }}
                  >
                    关系依据 ↗
                  </a>
                )}
              </div>
            ))}
            {!a.outgoing.length && !a.incoming.length && (
              <p className="muted" style={{ fontSize: 12 }}>
                暂无已确认的直接关系。
              </p>
            )}
          </div>
          <div className="panel">
            <h3>来源链接</h3>
            {[
              { url: a.url, label: "原文" },
              ...a.links.filter((l) => l.url !== a.url),
            ].map((l) => (
              <a
                className="reading-step"
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {l.label} ↗
              </a>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
