import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";
import { AdminNotice } from "@/components/admin-notice";
import { requestDraft, rejectArticle } from "../../actions";
import { EditorForm, SubmitButton } from "../editor-form";
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
  const [article, topics, sources, organizations, people, messages] =
    await Promise.all([
      prisma.article.findUnique({
        where: { id },
        include: {
          topics: true,
          links: true,
          engineeringCase: true,
          people: true,
        },
      }),
      prisma.topic.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.source.findMany({ orderBy: { name: "asc" } }),
      prisma.organization.findMany({ orderBy: { name: "asc" } }),
      prisma.person.findMany({ orderBy: { name: "asc" } }),
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
      <div className="notice">
        当前版本 v{article.version} ·{" "}
        <Link href={`/admin/articles/${id}/history`}>查看历史与恢复</Link>
        。恢复历史会重新进入待审核；并发修改不会覆盖已有内容。
      </div>
      <EditorForm>
        <input type="hidden" name="id" value={article.id} />
        <input type="hidden" name="version" value={article.version} />
        <div
          className="form-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))",
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
            作者所属机构
            <select
              className="input"
              name="organizationId"
              defaultValue={article.organizationId || ""}
            >
              <option value="">未标注机构</option>
              {organizations.map((org) => (
                <option value={org.id} key={org.id}>
                  {org.name}
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
            border: "1px solid var(--line)",
            padding: 20,
            borderRadius: 8,
          }}
        >
          <legend>关联人物</legend>
          <div className="check-grid">
            {people.map((person) => (
              <label key={person.id}>
                <input
                  type="checkbox"
                  name="people"
                  value={person.id}
                  defaultChecked={article.people.some(
                    (p) => p.personId === person.id,
                  )}
                />{" "}
                {person.name}
              </label>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            “作者”可填写完整署名；人物关联用于已有作者档案。
          </p>
        </fieldset>
        <fieldset
          style={{
            border: "1px solid var(--line)",
            padding: 20,
            borderRadius: 8,
          }}
        >
          <legend>工程案例拆解</legend>
          <label>
            <input
              type="checkbox"
              name="hasEngineeringCase"
              defaultChecked={!!article.engineeringCase}
            />{" "}
            保存工程案例（取消勾选可移除，旧内容保留在版本历史）
          </label>
          <div className="form-grid" style={{ marginTop: 15 }}>
            {[
              ["problem", "工程问题"],
              ["architecture", "架构说明"],
              ["solution", "解决方案"],
              ["outcome", "效果与局限"],
            ].map(([name, label]) => (
              <label className="field" key={name}>
                {label}
                <textarea
                  name={`case_${name}`}
                  rows={3}
                  defaultValue={
                    article.engineeringCase?.[
                      name as
                        | "problem"
                        | "architecture"
                        | "solution"
                        | "outcome"
                    ] || ""
                  }
                />
              </label>
            ))}
          </div>
          <label className="field" style={{ marginTop: 12 }}>
            案例证据链接
            <input
              name="case_evidenceUrl"
              type="url"
              className="input"
              defaultValue={article.engineeringCase?.evidenceUrl || article.url}
            />
          </label>
        </fieldset>
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
              gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))",
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
            gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,180px),1fr))",
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
        <label className="field">
          本次修订说明
          <input
            name="revisionNote"
            className="input"
            maxLength={1000}
            placeholder="例如：依据原文纠正评测数据，补充工程边界"
          />
        </label>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <SubmitButton>保存内容与审核状态</SubmitButton>
          <a
            className="button secondary"
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            核对原文 ↗
          </a>
        </div>
      </EditorForm>
      <section className="panel">
        <details>
          <summary>驳回与归档</summary>
          <p className="muted">
            不符合收录标准的内容将从前台隐藏，原因与原版本保留，不永久删除。
          </p>
          <form
            action={rejectArticle}
            style={{ display: "grid", gap: 12, marginTop: 15 }}
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="version" value={article.version} />
            <label className="field">
              驳回原因
              <textarea name="reason" required minLength={5} maxLength={1000} />
            </label>
            <SubmitButton secondary>驳回并归档</SubmitButton>
          </form>
        </details>
      </section>
      <section className="panel" style={{ padding: 28, marginTop: 24 }}>
        <h2>机器建议与原始记录</h2>
        <p className="muted">
          机器草稿不会自动覆盖人工字段，也不会自动发布。未配置模型时可以直接在上方手工编辑。
        </p>
        <form action={requestDraft}>
          <input type="hidden" name="id" value={id} />
          <SubmitButton secondary pendingText="正在生成草稿…">
            生成中文导读建议
          </SubmitButton>
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
