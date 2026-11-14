import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";
import { AdminNotice } from "@/components/admin-notice";
const labels: Record<string, string> = {
  discovered: "已发现",
  pending_review: "待审核",
  published: "已发布",
  archived: "已归档",
};
export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    notice?: string;
    error?: string;
  }>;
}) {
  await requireAuth();
  const params = await searchParams;
  const status =
    params.status && Object.hasOwn(labels, params.status)
      ? params.status
      : undefined;
  const q = params.q?.slice(0, 200).trim();
  const [articles, counts] = await Promise.all([
    prisma.article.findMany({
      where: {
        status,
        ...(q
          ? {
              OR: [
                { title: { contains: q } },
                { originalTitle: { contains: q } },
              ],
            }
          : {}),
      },
      include: { source: true, topics: { include: { topic: true } } },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.article.groupBy({ by: ["status"], _count: true }),
  ]);
  return (
    <main className="page-shell" style={{ paddingTop: 36, paddingBottom: 80 }}>
      <AdminNav />
      <div className="section-heading">
        <div>
          <p className="eyebrow">CONTENT DESK</p>
          <h1>让每一条知识都有依据</h1>
          <p className="muted">
            发现、整理、审核、发布。公开页面只显示已发布内容。
          </p>
        </div>
        <Link className="button" href="/admin/import">
          ＋ 收录资料
        </Link>
      </div>
      <AdminNotice {...params} />
      <div
        style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}
      >
        {Object.entries(labels).map(([key, label]) => (
          <Link className="badge" key={key} href={`/admin?status=${key}`}>
            {label} {counts.find((c) => c.status === key)?._count ?? 0}
          </Link>
        ))}
      </div>
      <form
        method="get"
        style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}
      >
        <input
          className="input"
          style={{ flex: 1 }}
          aria-label="搜索后台内容"
          name="q"
          placeholder="搜索中文或原始标题…"
          defaultValue={q}
        />
        <select
          aria-label="内容状态"
          className="input"
          name="status"
          defaultValue={status || ""}
        >
          <option value="">所有状态</option>
          {Object.entries(labels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <button className="button secondary">筛选</button>
        <Link className="button secondary" href="/admin">
          清除
        </Link>
      </form>
      <div className="panel">
        {articles.length ? (
          articles.map((article) => (
            <div
              key={article.id}
              style={{
                padding: "22px 24px",
                borderBottom: "1px solid var(--border, #e4e7e5)",
                display: "flex",
                justifyContent: "space-between",
                gap: 20,
                alignItems: "center",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <span className="badge">
                    {labels[article.status] ?? article.status}
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {article.source?.name || "未关联来源"} ·{" "}
                    {article.updatedAt.toISOString().slice(0, 10)}
                  </span>
                </div>
                <Link
                  href={`/admin/articles/${article.id}`}
                  style={{ fontWeight: 600, fontSize: 17 }}
                >
                  {article.title}
                </Link>
                <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  {article.topics.map((t) => t.topic.name).join(" / ") ||
                    "等待补充技术主题"}
                </p>
              </div>
              <Link
                className="button secondary"
                href={`/admin/articles/${article.id}`}
              >
                编辑
              </Link>
            </div>
          ))
        ) : (
          <div style={{ padding: 40, textAlign: "center" }}>
            <h2>没有符合条件的内容</h2>
            <p className="muted">调整筛选，或收录第一条资料。</p>
            <Link href="/admin/import" className="button">
              收录资料
            </Link>
          </div>
        )}
      </div>
      {articles.length === 200 && (
        <p className="muted">显示最近更新的 200 条。请用标题或状态缩小范围。</p>
      )}
    </main>
  );
}
