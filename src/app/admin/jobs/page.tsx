import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminNav } from "@/components/admin-nav";
import { AdminNotice } from "@/components/admin-notice";
import { synchronize, retryJob } from "./actions";
import { Prisma } from "@prisma/client";
const labels: Record<string, string> = {
  running: "执行中",
  completed: "已完成",
  not_modified: "来源未变更",
  completed_with_errors: "部分完成",
  failed: "失败",
  interrupted: "已中断",
};
const when = (date: Date | null) =>
  date
    ? date.toISOString().replace("T", " ").slice(0, 19) + " UTC"
    : "尚无记录";
export default async function JobsAdmin({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string;
    error?: string;
    status?: string;
    page?: string;
  }>;
}) {
  await requireAuth();
  const params = await searchParams;
  const page = Math.max(
    1,
    Math.min(
      10000,
      Number.isFinite(Number(params.page))
        ? Math.floor(Number(params.page))
        : 1,
    ),
  );
  const where: Prisma.IngestionJobWhereInput =
    params.status && params.status in labels ? { status: params.status } : {};
  const [jobs, total, sources, locks] = await Promise.all([
    prisma.ingestionJob.findMany({
      where,
      include: { source: true },
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * 20,
      take: 20,
    }),
    prisma.ingestionJob.count({ where }),
    prisma.source.findMany({
      where: { feedUrl: { not: null } },
      orderBy: { name: "asc" },
    }),
    prisma.syncLease.count({ where: { expiresAt: { gt: new Date() } } }),
  ]);
  return (
    <main className="page-shell">
      <AdminNav />
      <div className="section-heading">
        <div>
          <p className="eyebrow">INGESTION ACTIVITY</p>
          <h1>稳定收录，每一步可追溯</h1>
          <p className="muted">
            {sources.filter((s) => s.enabled).length} 个启用订阅 · {locks}{" "}
            个正在持有采集租约的任务。新资料始终进入待审核队列。
          </p>
        </div>
        <form action={synchronize}>
          <button className="button" disabled={!sources.some((s) => s.enabled)}>
            立即检查全部来源
          </button>
        </form>
      </div>
      <AdminNotice notice={params.notice} error={params.error} />
      <section className="panel">
        <div className="section-heading">
          <h2>订阅健康状态</h2>
          <Link href="/admin/sources">管理来源与检查周期 →</Link>
        </div>
        {!sources.length ? (
          <p className="muted">
            还没有配置订阅地址，请在来源管理中添加 RSS / Atom 地址。
          </p>
        ) : (
          <div className="article-list">
            {sources.map((source) => (
              <article key={source.id} className="relation">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 15,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <strong>{source.name}</strong>{" "}
                    <span className="badge">
                      {source.enabled
                        ? `每 ${source.syncIntervalMinutes} 分钟`
                        : "已暂停"}
                    </span>
                    <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                      最近检查：{when(source.lastCheckedAt)} · 最近成功：
                      {when(source.lastSuccessAt)}
                    </p>
                    {source.lastError && (
                      <p
                        style={{
                          fontSize: 12,
                          color: "var(--accent)",
                          overflowWrap: "anywhere",
                        }}
                      >
                        最近错误：{source.lastError}
                      </p>
                    )}
                  </div>
                  <form action={synchronize}>
                    <input type="hidden" name="sourceId" value={source.id} />
                    <button
                      className="button secondary"
                      disabled={!source.enabled}
                    >
                      {source.lastError ? "重试此来源" : "检查此来源"}
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <div className="section-heading">
        <h2>
          任务记录 <span className="badge">{total}</span>
        </h2>
        <form action="/admin/jobs" style={{ display: "flex", gap: 8 }}>
          <select
            name="status"
            aria-label="任务状态"
            defaultValue={params.status || ""}
          >
            <option value="">全部状态</option>
            {Object.entries(labels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <button className="button secondary">筛选</button>
        </form>
      </div>
      <div className="panel">
        {jobs.length ? (
          jobs.map((job) => {
            const details =
              job.details &&
              typeof job.details === "object" &&
              !Array.isArray(job.details)
                ? job.details
                : {};
            const canRetry = !!job.sourceId || typeof details.url === "string";
            return (
              <article
                key={job.id}
                style={{
                  padding: "22px 0",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <strong>{job.source?.name || job.adapter}</strong>
                  <span className="badge">
                    {labels[job.status] || job.status}
                  </span>
                </div>
                <p className="muted" style={{ fontSize: 12, margin: "9px 0" }}>
                  {when(job.startedAt)} · {job.adapter}
                  {job.finishedAt &&
                    ` · 耗时 ${Math.max(0, (job.finishedAt.getTime() - job.startedAt.getTime()) / 1000).toFixed(1)} 秒`}
                </p>
                <p>
                  新增 {job.imported} · 重复 {job.duplicates} · 失败{" "}
                  {job.failed}
                </p>
                {job.error && (
                  <p className="notice" style={{ overflowWrap: "anywhere" }}>
                    {job.error}
                  </p>
                )}
                <details style={{ marginTop: 10 }}>
                  <summary className="muted">查看任务详情</summary>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                      fontSize: 12,
                    }}
                  >
                    {JSON.stringify(job.details, null, 2)}
                  </pre>
                </details>
                {canRetry && job.status !== "running" && (
                  <form action={retryJob} style={{ marginTop: 12 }}>
                    <input type="hidden" name="id" value={job.id} />
                    <button className="button secondary">重新检查</button>
                  </form>
                )}
              </article>
            );
          })
        ) : (
          <div className="empty-state">
            <h2>暂无匹配的采集任务</h2>
            <p>调整筛选条件，或添加一个来源并检查更新。</p>
            <Link href="/admin/import" className="button">
              收录资料
            </Link>
          </div>
        )}
      </div>
      {total > 20 && (
        <nav className="pagination" aria-label="任务分页">
          {page > 1 && (
            <Link
              href={`/admin/jobs?page=${page - 1}&status=${params.status || ""}`}
            >
              ← 上一页
            </Link>
          )}
          <span>
            {page} / {Math.max(1, Math.ceil(total / 20))}
          </span>
          {page * 20 < total && (
            <Link
              href={`/admin/jobs?page=${page + 1}&status=${params.status || ""}`}
            >
              下一页 →
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
