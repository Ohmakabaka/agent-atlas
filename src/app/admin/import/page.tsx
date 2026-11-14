import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminNav } from "@/components/admin-nav";
import { AdminNotice } from "@/components/admin-notice";
import { batchImport, importArticle } from "../actions";
export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  await requireAuth();
  const [sources, messages] = await Promise.all([
    prisma.source.findMany({ orderBy: { name: "asc" } }),
    searchParams,
  ]);
  return (
    <main className="page-shell" style={{ paddingTop: 36, paddingBottom: 80 }}>
      <AdminNav />
      <div className="section-heading">
        <div>
          <p className="eyebrow">CURATE THE SIGNAL</p>
          <h1>收录值得阅读的资料</h1>
          <p className="muted">
            支持文章、论文、GitHub 项目和微信公众号链接。导入后进入待审核队列。
          </p>
        </div>
      </div>
      <AdminNotice {...messages} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))",
          gap: 24,
        }}
      >
        <section className="panel" style={{ padding: 28 }}>
          <h2>从链接开始</h2>
          <p className="muted">
            只提取页面元信息，不保存第三方全文。受限页面可填写标题和导读继续收录。
          </p>
          <form
            action={importArticle}
            style={{ display: "grid", gap: 20, marginTop: 24 }}
          >
            <label className="field">
              原始链接
              <input
                className="input"
                type="url"
                name="url"
                required
                placeholder="https://…"
              />
            </label>
            <label className="field">
              中文标题（可选）
              <input
                className="input"
                name="title"
                maxLength={300}
                placeholder="抓取受限时请手工补充"
              />
            </label>
            <label className="field">
              关联来源
              <select className="input" name="sourceId" defaultValue="">
                <option value="">自动识别 / 之后补充</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              中文导读（可选）
              <textarea
                className="input"
                name="summary"
                rows={4}
                maxLength={30000}
                placeholder="简述这篇内容值得阅读的原因…"
              />
            </label>
            <button className="button">导入链接并开始审核</button>
          </form>
        </section>
        <section className="panel" style={{ padding: 28 }}>
          <h2>批量导入</h2>
          <p className="muted">
            粘贴 JSON 数组或含表头的 CSV。每条至少包含 url，可补充
            title、summary、sourceId 等字段。
          </p>
          <form
            action={batchImport}
            style={{ display: "grid", gap: 20, marginTop: 24 }}
          >
            <label className="field">
              数据格式
              <select className="input" name="format">
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
              </select>
            </label>
            <label className="field">
              内容
              <textarea
                className="input"
                name="content"
                rows={12}
                required
                maxLength={1000000}
                placeholder={
                  '[\n  {"url":"https://example.org/article", "title":"中文标题"}\n]'
                }
              />
            </label>
            <button className="button secondary">导入为待审核内容</button>
          </form>
          <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
            重复链接保留已有条目；失败记录会报告原因。批量导入不会自动发布。
          </p>
        </section>
      </div>
    </main>
  );
}
