import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminNav } from "@/components/admin-nav";
import { AdminNotice } from "@/components/admin-notice";
import { runSync } from "../actions";
const labels: Record<string, string> = {
  running: "执行中",
  completed: "已完成",
  succeeded: "已完成",
  success: "已完成",
  partial: "部分完成",
  completed_with_errors: "部分完成",
  failed: "失败",
};
export default async function JobsAdmin({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  await requireAuth();
  const [jobs, sources, messages] = await Promise.all([
    prisma.ingestionJob.findMany({
      include: { source: true },
      orderBy: { startedAt: "desc" },
      take: 100,
    }),
    prisma.source.count({ where: { enabled: true, feedUrl: { not: null } } }),
    searchParams,
  ]);
  return (
    <main className="page-shell" style={{ paddingTop: 36, paddingBottom: 80 }}>
      <AdminNav />
      <div className="section-heading">
        <div>
          <p className="eyebrow">INGESTION ACTIVITY</p>
          <h1>每一次采集都有记录</h1>
          <p className="muted">
            {sources}{" "}
            个启用的订阅源。采集结果进入待审核队列，重复链接不会生成新条目。
          </p>
        </div>
        <form action={runSync}>
          <button className="button" disabled={!sources}>
            检查订阅更新
          </button>
        </form>
      </div>
      <AdminNotice {...messages} />
      <p className="notice" style={{ padding: 16, marginBottom: 24 }}>
        定时同步：在任务调度器中运行 <code>npm run ingest</code>
        。这里只会执行手动触发，不会悄悄启动后台常驻任务。
        <Link href="/admin/sources">管理来源 →</Link>
      </p>
      <div className="panel">
        {jobs.length ? (
          jobs.map((job) => (
            <article
              key={job.id}
              style={{
                padding: 24,
                borderBottom: "1px solid var(--border,#e4e7e5)",
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
              <p className="muted" style={{ fontSize: 12, margin: "10px 0" }}>
                {job.startedAt.toISOString().replace("T", " ").slice(0, 19)} UTC
                · {job.adapter}
              </p>
              <p>
                新增 {job.imported} · 重复 {job.duplicates} · 失败 {job.failed}
              </p>
              {job.error && (
                <p
                  role="alert"
                  className="notice"
                  style={{ fontSize: 13, overflowWrap: "anywhere" }}
                >
                  {job.error}
                </p>
              )}
              <details>
                <summary className="muted" style={{ fontSize: 12 }}>
                  查看任务详情
                </summary>
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
            </article>
          ))
        ) : (
          <div style={{ padding: 40, textAlign: "center" }}>
            <h2>还没有采集任务</h2>
            <p className="muted">导入一个链接，或添加订阅来源后检查更新。</p>
            <Link href="/admin/import" className="button">
              收录第一条资料
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
