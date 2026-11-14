import Link from "next/link";
import type { Topic } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";
import { AdminNotice } from "@/components/admin-notice";
import { saveTopic, deleteTopic } from "./actions";
import { TopicSubmit } from "./submit-button";
const lines = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item) => typeof item === "string").join("\n")
    : "";
function TopicForm({
  topic,
  parents,
}: {
  topic?: Topic;
  parents: Pick<Topic, "id" | "name" | "slug">[];
}) {
  return (
    <form
      action={saveTopic}
      style={{ display: "grid", gap: 18, marginTop: 20 }}
    >
      <input type="hidden" name="id" value={topic?.id || ""} />
      <div className="form-grid">
        <label className="field">
          主题名称
          <input
            className="input"
            name="name"
            required
            maxLength={100}
            defaultValue={topic?.name}
            placeholder="例如：Agent 可靠性"
          />
        </label>
        <label className="field">
          英文名称
          <input
            className="input"
            name="englishName"
            required
            maxLength={200}
            defaultValue={topic?.englishName}
            placeholder="Agent Reliability"
          />
        </label>
        <label className="field">
          URL 标识
          <input
            className="input"
            name="slug"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={100}
            defaultValue={topic?.slug}
            placeholder="agent-reliability"
          />
          <small className="muted">
            小写字母、数字和短横线。有资料、子主题或关系引用后不可修改，避免已有链接失效。
          </small>
        </label>
        <label className="field">
          父主题
          <select name="parentId" defaultValue={topic?.parentId || ""}>
            <option value="">无父主题（主要方向）</option>
            {parents
              .filter((parent) => parent.id !== topic?.id)
              .map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name} / {parent.slug}
                </option>
              ))}
          </select>
        </label>
      </div>
      <label className="field">
        主题概述
        <textarea
          name="description"
          required
          minLength={10}
          maxLength={10000}
          rows={4}
          defaultValue={topic?.description}
        />
      </label>
      <label className="field">
        解决的核心问题
        <input
          className="input"
          name="question"
          required
          maxLength={500}
          defaultValue={topic?.question}
          placeholder="这个技术方向帮助读者解决什么问题？"
        />
      </label>
      <div className="form-grid">
        <label className="field">
          关键概念（每行一个）
          <textarea
            name="concepts"
            rows={5}
            defaultValue={lines(topic?.concepts)}
            placeholder={"任务成功率\n工具调用恢复\n人工介入"}
          />
        </label>
        <label className="field">
          推荐阅读路径（按顺序，每行一个资料标识）
          <textarea
            name="readingPath"
            rows={5}
            defaultValue={lines(topic?.readingPath)}
            placeholder={"building-effective-agents\nreact"}
          />
          <small className="muted">
            可编排跨主题的已发布资料；这是编辑阅读建议，不代表直接引用或技术继承。归档资料不会在公开路径中展示。
          </small>
        </label>
      </div>
      <div className="form-grid">
        <label className="field">
          显示顺序
          <input
            className="input"
            name="sortOrder"
            type="number"
            min={-10000}
            max={10000}
            required
            defaultValue={topic?.sortOrder ?? 0}
          />
          <small className="muted">数字越小越靠前；同层级内排序。</small>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            name="featured"
            defaultChecked={topic?.featured ?? false}
          />
          设为重点阅读专题
        </label>
      </div>
      <div>
        <TopicSubmit>{topic ? "保存主题" : "创建主题"}</TopicSubmit>
      </div>
    </form>
  );
}
export default async function TopicsAdmin({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    edit?: string;
    notice?: string;
    error?: string;
  }>;
}) {
  await requireAuth();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const rawPage = Number(params.page);
  const requestedPage = Number.isFinite(rawPage)
    ? Math.min(10000, Math.max(1, Math.floor(rawPage)))
    : 1;
  const where = q
    ? {
        OR: [
          { name: { contains: q } },
          { englishName: { contains: q } },
          { slug: { contains: q } },
        ],
      }
    : {};
  const [total, parents, published] = await Promise.all([
    prisma.topic.count({ where }),
    prisma.topic.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.article.findMany({
      where: { status: "published" },
      select: { slug: true, title: true },
      orderBy: { title: "asc" },
      take: 300,
    }),
  ]);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / 20)));
  const topics = await prisma.topic.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      parent: true,
      _count: {
        select: {
          articles: true,
          children: true,
          incoming: true,
          outgoing: true,
        },
      },
    },
    skip: (page - 1) * 20,
    take: 20,
  });
  // A save may move a topic onto a different page; keep that edit target visible.
  const selected =
    params.edit && !topics.some((topic) => topic.id === params.edit)
      ? await prisma.topic.findUnique({
          where: { id: params.edit },
          include: {
            parent: true,
            _count: {
              select: {
                articles: true,
                children: true,
                incoming: true,
                outgoing: true,
              },
            },
          },
        })
      : null;
  const visible = selected ? [selected, ...topics] : topics;
  const pageHref = (next: number) =>
    `/admin/topics?${new URLSearchParams({ ...(q ? { q } : {}), page: String(next) })}`;
  return (
    <main className="page-shell">
      <AdminNav />
      <header className="page-intro">
        <span className="eyebrow">TAXONOMY & READING PATHS</span>
        <h1>维护技术主题与阅读路径</h1>
        <p>
          主题、父子层级、概念和专题都从数据库读取。主题结构应帮助读者定位问题；技术关系的依据请在知识关联中维护。
        </p>
      </header>
      <AdminNotice notice={params.notice} error={params.error} />
      <section className="panel">
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            ＋ 新建技术主题
          </summary>
          <TopicForm parents={parents} />
        </details>
      </section>
      <section className="panel">
        <details>
          <summary style={{ cursor: "pointer" }}>
            查看已发布资料标识（用于编排阅读路径）
          </summary>
          <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
            可复制下列标识到阅读路径，每行一个，顺序即阅读次序。最多列出 300
            条；更多资料可在内容管理中查看其公开链接。
          </p>
          <div style={{ maxHeight: 300, overflow: "auto", marginTop: 12 }}>
            {published.map((article) => (
              <p key={article.slug} style={{ margin: "8px 0", fontSize: 12 }}>
                <code>{article.slug}</code> ·{" "}
                <Link href={`/articles/${article.slug}`}>
                  {article.title} ↗
                </Link>
              </p>
            ))}
          </div>
        </details>
      </section>
      <form className="search-large" action="/admin/topics">
        <input
          className="input"
          aria-label="搜索技术主题"
          name="q"
          defaultValue={q}
          placeholder="搜索主题名称、英文名称或标识"
        />
        <button className="button secondary">搜索</button>
        <Link className="button secondary" href="/admin/topics">
          清除
        </Link>
      </form>
      <p className="results-count">
        共 {total} 个主题 · 第 {page} / {Math.max(1, Math.ceil(total / 20))} 页
      </p>
      {visible.map((topic) => (
        <section key={topic.id} className="panel">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2>
                {topic.name}{" "}
                {topic.featured && <span className="badge">重点专题</span>}
              </h2>
              <p className="muted" style={{ fontSize: 12 }}>
                {topic.englishName} · {topic.slug} ·{" "}
                {topic.parent ? `父主题：${topic.parent.name}` : "主要方向"}
              </p>
              <p className="muted" style={{ fontSize: 12 }}>
                {topic._count.articles} 条资料 · {topic._count.children}{" "}
                个子主题 · {topic._count.incoming + topic._count.outgoing}{" "}
                条关联
              </p>
            </div>
            <Link href={`/topics/${topic.slug}`} className="button secondary">
              查看主题 ↗
            </Link>
          </div>
          <details open={params.edit === topic.id} style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer" }}>编辑主题与阅读路径</summary>
            <TopicForm topic={topic} parents={parents} />
          </details>
          <details style={{ marginTop: 16 }}>
            <summary
              style={{ cursor: "pointer", fontSize: 12, color: "var(--muted)" }}
            >
              删除空主题
            </summary>
            <p className="muted" style={{ margin: "10px 0", fontSize: 12 }}>
              仅能删除没有关联资料、子主题和知识关系的主题。输入{" "}
              <code>{topic.slug}</code> 确认，不会删除任何关联内容。
            </p>
            <form
              action={deleteTopic}
              style={{ display: "flex", gap: 12, flexWrap: "wrap" }}
            >
              <input type="hidden" name="id" value={topic.id} />
              <input
                className="input"
                style={{ flex: 1 }}
                name="confirmation"
                required
                aria-label={`确认删除 ${topic.name}`}
                placeholder={topic.slug}
              />
              <TopicSubmit secondary>删除空主题</TopicSubmit>
            </form>
          </details>
        </section>
      ))}
      {!visible.length && (
        <div className="panel empty-state">
          <h2>没有匹配的主题</h2>
          <p>调整关键词，或使用上方表单创建新的技术主题。</p>
        </div>
      )}
      {total > 20 && (
        <nav className="pagination" aria-label="主题分页">
          {page > 1 && <Link href={pageHref(page - 1)}>← 上一页</Link>}
          <span>
            {page} / {Math.ceil(total / 20)}
          </span>
          {page * 20 < total && <Link href={pageHref(page + 1)}>下一页 →</Link>}
        </nav>
      )}
    </main>
  );
}
