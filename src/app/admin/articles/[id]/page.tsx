import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";
import { AdminNotice } from "@/components/admin-notice";
import { requestDraft, saveArticle } from "../../actions";
const fieldStyle = { display: "grid", gap: 8 } as const;
export default async function ArticleEditor({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  await requireAuth();
  const { id } = await params;
  const [article, topics, sources, messages] = await Promise.all([
    prisma.article.findUnique({
      where: { id },
      include: { topics: true, links: true },
    }),
    prisma.topic.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.source.findMany({ orderBy: { name: "asc" } }),
    searchParams,
  ]);
  if (!article) notFound();
  const topicIds = new Set(article.topics.map((t) => t.topicId));
  const takeaways = Array.isArray(article.takeaways)
    ? article.takeaways.filter((v) => typeof v === "string").join("\n")
    : "";
  return (
    <main className="page-shell" style={{ paddingTop: 36, paddingBottom: 80 }}>
      <AdminNav />
      <Link href="/admin" className="muted">
        ← 内容列表
      </Link>
      <div className="section-heading" style={{ marginTop: 20 }}>
        <div>
          <p className="eyebrow">EDITORIAL REVIEW</p>
          <h1>编辑与审核</h1>
          <p className="muted">
            原始元数据、机器建议与人工导读独立保存。请核对原文后再发布。
          </p>
        </div>
        {article.status === "published" && (
          <Link href={`/articles/${article.slug}`} className="button secondary">
            查看公开页面 ↗
          </Link>
        )}
      </div>
      <AdminNotice {...messages} />
      <form
        action={saveArticle}
        className="panel"
        style={{ padding: 28, display: "grid", gap: 24 }}
      >
        <input type="hidden" name="id" value={article.id} />
        <div
          className="form-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
            gap: 20,
          }}
        >
          <label className="field" style={fieldStyle}>
            中文标题
            <input
              className="input"
              required
              name="title"
              defaultValue={article.title}
              maxLength={300}
            />
          </label>
          <label className="field" style={fieldStyle}>
            原始标题
            <input
              className="input"
              required
              name="originalTitle"
              defaultValue={article.originalTitle}
              maxLength={500}
            />
          </label>
          <label className="field" style={fieldStyle}>
            原文链接
            <input
              className="input"
              required
              name="url"
              type="url"
              defaultValue={article.url}
            />
          </label>
          <label className="field" style={fieldStyle}>
            作者
            <input
              className="input"
              name="authorName"
              defaultValue={article.authorName}
            />
          </label>
          <label className="field" style={fieldStyle}>
            来源
            <select
              className="input"
              name="sourceId"
              defaultValue={article.sourceId || ""}
            >
              <option value="">未关联来源</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={fieldStyle}>
            原文发布日期
            <input
              className="input"
              type="date"
              name="publishedAt"
              defaultValue={
                article.publishedAt?.toISOString().slice(0, 10) || ""
              }
            />
          </label>
        </div>
        <label className="field" style={fieldStyle}>
          中文导读（支持 Markdown）
          <textarea
            className="input"
            name="summary"
            rows={8}
            maxLength={30000}
            defaultValue={article.summary}
            placeholder="用自己的话概括原文的问题、方法和局限，不复制第三方全文。"
          />
        </label>
        <label className="field" style={fieldStyle}>
          技术要点（每行一条）
          <textarea
            className="input"
            name="takeaways"
            rows={5}
            defaultValue={takeaways}
          />
        </label>
        <label className="field" style={fieldStyle}>
          适合谁阅读
          <input
            className="input"
            name="audience"
            defaultValue={article.audience}
            maxLength={1000}
          />
        </label>
        <fieldset
          style={{
            border: "1px solid var(--border, #dfe5e1)",
            padding: 20,
            borderRadius: 10,
          }}
        >
          <legend>技术主题</legend>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
              gap: 12,
            }}
          >
            {topics.map((topic) => (
              <label
                key={topic.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  name="topics"
                  value={topic.id}
                  defaultChecked={topicIds.has(topic.id)}
                />
                <span>{topic.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div
          className="form-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
            gap: 20,
          }}
        >
          <label className="field" style={fieldStyle}>
            内容类型
            <select className="input" name="type" defaultValue={article.type}>
              {Object.entries({
                article: "技术文章",
                paper: "论文",
                docs: "官方文档",
                repository: "开源实现",
                podcast: "访谈播客",
              }).map(([v, n]) => (
                <option value={v} key={v}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={fieldStyle}>
            资料层次
            <select className="input" name="layer" defaultValue={article.layer}>
              <option value="primary">原始资料</option>
              <option value="community">中文解读</option>
              <option value="engineering">工程实践</option>
            </select>
          </label>
          <label className="field" style={fieldStyle}>
            语言
            <select
              className="input"
              name="language"
              defaultValue={article.language}
            >
              <option value="en">英文</option>
              <option value="zh">中文</option>
              <option value="multilingual">多语言</option>
            </select>
          </label>
          <label className="field" style={fieldStyle}>
            质量等级
            <select
              className="input"
              name="quality"
              defaultValue={article.quality}
            >
              <option value="standard">标准</option>
              <option value="curated">精选</option>
            </select>
          </label>
          <label className="field" style={fieldStyle}>
            审核状态
            <select
              className="input"
              name="status"
              defaultValue={article.status}
            >
              <option value="discovered">已发现</option>
              <option value="pending_review">待审核</option>
              <option value="published">已发布</option>
              <option value="archived">已归档</option>
            </select>
          </label>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          发布需要中文标题、至少 20
          字中文导读和一个技术主题。已发布内容的编辑会立即生效；归档后从公开页面移除。
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button className="button">保存内容与审核状态</button>
          <a
            className="button secondary"
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            核对原文 ↗
          </a>
        </div>
      </form>
      <section className="panel" style={{ padding: 28, marginTop: 24 }}>
        <h2>机器建议与原始记录</h2>
        <p className="muted">
          机器草稿不会自动覆盖人工字段，也不会自动发布。未配置模型时可以直接在上方手工编辑。
        </p>
        <form action={requestDraft}>
          <input type="hidden" name="id" value={id} />
          <button className="button secondary">生成中文导读建议</button>
        </form>
        <details style={{ marginTop: 20 }}>
          <summary>查看机器草稿</summary>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              fontSize: 12,
              padding: 16,
            }}
          >
            {JSON.stringify(article.aiDraft, null, 2)}
          </pre>
        </details>
        <details style={{ marginTop: 16 }}>
          <summary>查看原始元数据</summary>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              fontSize: 12,
              padding: 16,
            }}
          >
            {JSON.stringify(article.rawMetadata, null, 2)}
          </pre>
        </details>
        {article.links.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <h3>保留的来源链接</h3>
            {article.links.map((link) => (
              <p
                key={link.id}
                style={{ overflowWrap: "anywhere", fontSize: 13 }}
              >
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label} · {link.url}
                </a>
              </p>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
