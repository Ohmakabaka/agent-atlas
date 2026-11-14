import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminNav } from "@/components/admin-nav";
import { AdminNotice } from "@/components/admin-notice";
import { deleteRelation, saveRelation } from "../actions";
import type { Relation } from "@prisma/client";
const typeLabels: Record<string, string> = {
  explains: "解释技术",
  implements: "实现技术",
  discusses: "讨论技术",
  compares_with: "比较方案",
  references: "明确引用",
  extends: "扩展工作",
  challenges: "提出质疑",
  related_to: "主题关联",
  prerequisite_for: "前置知识",
  evolves_from: "演进自",
};
type Option = { id: string; label: string };
function RelationForm({
  relation,
  options,
}: {
  relation?: Relation;
  options: Option[];
}) {
  const from = relation?.fromArticleId
    ? `article:${relation.fromArticleId}`
    : relation?.fromTopicId
      ? `topic:${relation.fromTopicId}`
      : "";
  const to = relation?.toArticleId
    ? `article:${relation.toArticleId}`
    : relation?.toTopicId
      ? `topic:${relation.toTopicId}`
      : "";
  return (
    <form
      action={saveRelation}
      style={{ display: "grid", gap: 16, marginTop: 20 }}
    >
      <input type="hidden" name="id" value={relation?.id || ""} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          gap: 16,
        }}
      >
        <label className="field">
          起点
          <select className="input" required name="from" defaultValue={from}>
            <option value="">选择内容或主题</option>
            {options.map((o) => (
              <option value={o.id} key={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          终点
          <select className="input" required name="to" defaultValue={to}>
            <option value="">选择内容或主题</option>
            {options.map((o) => (
              <option value={o.id} key={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          关系类型
          <select
            className="input"
            name="type"
            defaultValue={relation?.type || "related_to"}
          >
            {Object.entries(typeLabels).map(([k, v]) => (
              <option value={k} key={k}>
                {k} · {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          确认状态
          <select
            className="input"
            name="status"
            defaultValue={relation?.status || "suggested"}
          >
            <option value="suggested">待审核建议</option>
            <option value="confirmed">已审核确认</option>
          </select>
        </label>
      </div>
      <label className="field">
        证据链接（确认关系时必填）
        <input
          className="input"
          name="evidenceUrl"
          type="url"
          defaultValue={relation?.evidenceUrl || ""}
          placeholder="https://…"
        />
      </label>
      <label className="field">
        关系说明
        <textarea
          className="input"
          name="description"
          rows={2}
          maxLength={3000}
          defaultValue={relation?.description}
        />
      </label>
      <button className="button secondary" style={{ justifySelf: "start" }}>
        保存关联
      </button>
    </form>
  );
}
export default async function RelationsAdmin({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  await requireAuth();
  const [relations, articles, topics, messages] = await Promise.all([
    prisma.relation.findMany({
      include: {
        fromArticle: true,
        toArticle: true,
        fromTopic: true,
        toTopic: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.article.findMany({
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
    prisma.topic.findMany({
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    searchParams,
  ]);
  const options = [
    ...topics.map((t) => ({ id: `topic:${t.id}`, label: `主题 · ${t.name}` })),
    ...articles.map((a) => ({
      id: `article:${a.id}`,
      label: `内容 · ${a.title}`,
    })),
  ];
  return (
    <main className="page-shell" style={{ paddingTop: 36, paddingBottom: 80 }}>
      <AdminNav />
      <div className="section-heading">
        <div>
          <p className="eyebrow">KNOWLEDGE RELATIONS</p>
          <h1>关联需要证据，推论需要审核</h1>
          <p className="muted">
            共同讨论一个主题，不等于存在继承关系。只有人工确认的关联会出现在公开页面。
          </p>
        </div>
      </div>
      <AdminNotice {...messages} />
      <section className="panel" style={{ padding: 24, marginBottom: 24 }}>
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            ＋ 添加知识关联
          </summary>
          <RelationForm options={options} />
        </details>
      </section>
      <div style={{ display: "grid", gap: 16 }}>
        {relations.length ? (
          relations.map((relation) => (
            <section
              key={relation.id}
              className="panel"
              style={{ padding: 24 }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <span className="badge">
                  {relation.status === "confirmed" ? "已确认" : "待审核建议"}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {relation.type}
                </span>
              </div>
              <p style={{ fontWeight: 600 }}>
                {relation.fromArticle?.title || relation.fromTopic?.name} →{" "}
                {relation.toArticle?.title || relation.toTopic?.name}
              </p>
              <p
                className="muted"
                style={{ fontSize: 13, margin: "10px 0 16px" }}
              >
                {relation.description}
              </p>
              <details>
                <summary style={{ cursor: "pointer", fontSize: 13 }}>
                  编辑关系与审核状态
                </summary>
                <RelationForm relation={relation} options={options} />
                <form action={deleteRelation} style={{ marginTop: 16 }}>
                  <input type="hidden" name="id" value={relation.id} />
                  <button className="button secondary">删除此关联</button>
                </form>
              </details>
            </section>
          ))
        ) : (
          <div className="panel" style={{ padding: 40, textAlign: "center" }}>
            <h2>还没有知识关联</h2>
            <p className="muted">从有明确依据的引用关系开始。</p>
          </div>
        )}
      </div>
    </main>
  );
}
