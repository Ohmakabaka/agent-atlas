import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";
export default async function Audit({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; type?: string }>;
}) {
  await requireAuth();
  const params = await searchParams;
  const page = Math.max(
    1,
    Math.min(10000, Number.parseInt(params.page || "1", 10) || 1),
  );
  const entityType = [
    "article",
    "topic",
    "source",
    "relation",
    "ingestion",
    "authentication",
  ].includes(params.type || "")
    ? params.type
    : undefined;
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { entityType },
      orderBy: { createdAt: "desc" },
      take: 30,
      skip: (page - 1) * 30,
    }),
    prisma.auditLog.count({ where: { entityType } }),
  ]);
  return (
    <main className="page-shell">
      <AdminNav />
      <header className="page-intro">
        <span className="eyebrow">EDITORIAL AUDIT</span>
        <h1>编辑操作记录</h1>
        <p>
          记录内容、主题、来源与知识关系的变更。这里不保存密码、会话或模型凭据。
        </p>
      </header>
      <form className="search-large">
        <select
          name="type"
          aria-label="操作对象"
          defaultValue={entityType || ""}
        >
          <option value="">全部对象</option>
          <option value="article">内容</option>
          <option value="topic">主题</option>
          <option value="source">来源</option>
          <option value="relation">关系</option>
          <option value="ingestion">采集</option>
          <option value="authentication">登录与会话</option>
        </select>
        <button className="button secondary">筛选</button>
      </form>
      <p className="results-count">{total} 条记录</p>
      <div className="article-list">
        {logs.map((log) => (
          <article className="panel" key={log.id}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <strong>{log.action}</strong>
              <time className="muted">
                {log.createdAt.toISOString().replace("T", " ").slice(0, 19)} UTC
              </time>
            </div>
            <p className="muted">
              {log.entityType} · {log.entityId}
            </p>
            <details>
              <summary>操作详情</summary>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  fontSize: 12,
                }}
              >
                {JSON.stringify(log.detail, null, 2)}
              </pre>
            </details>
            {log.entityType === "article" && (
              <Link
                href={`/admin/articles/${log.entityId}/history`}
                className="feature-link"
              >
                查看内容历史 →
              </Link>
            )}
          </article>
        ))}
        {!logs.length && (
          <div className="panel empty-state">
            <h2>还没有操作记录</h2>
            <p>完成一次编辑、主题维护或关系审核后，记录会出现在这里。</p>
          </div>
        )}
      </div>
      <nav className="pagination">
        {page > 1 && (
          <Link href={`?page=${page - 1}&type=${entityType || ""}`}>
            上一页
          </Link>
        )}
        <span>
          {page} / {Math.max(1, Math.ceil(total / 30))}
        </span>
        {page * 30 < total && (
          <Link href={`?page=${page + 1}&type=${entityType || ""}`}>
            下一页
          </Link>
        )}
      </nav>
    </main>
  );
}
