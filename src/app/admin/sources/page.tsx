import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminNav } from "@/components/admin-nav";
import { AdminNotice } from "@/components/admin-notice";
import { saveSource } from "../actions";
import type { Source, Organization } from "@prisma/client";
function SourceForm({
  source,
  organizations,
}: {
  source?: Source;
  organizations: Organization[];
}) {
  return (
    <form
      action={saveSource}
      style={{ display: "grid", gap: 16, marginTop: 20 }}
    >
      <input type="hidden" name="id" value={source?.id || ""} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 16,
        }}
      >
        <label className="field">
          名称
          <input
            className="input"
            required
            name="name"
            defaultValue={source?.name}
            maxLength={200}
          />
        </label>
        <label className="field">
          唯一标识
          <input
            className="input"
            required
            name="slug"
            defaultValue={source?.slug}
            pattern="[a-z0-9-]+"
            placeholder="example-engineering"
          />
        </label>
        <label className="field">
          官网
          <input
            className="input"
            required
            type="url"
            name="url"
            defaultValue={source?.url}
          />
        </label>
        <label className="field">
          RSS / Atom 地址（可选）
          <input
            className="input"
            type="url"
            name="feedUrl"
            defaultValue={source?.feedUrl || ""}
          />
        </label>
        <label className="field">
          来源类型
          <input
            className="input"
            required
            name="type"
            defaultValue={source?.type || "official"}
            list="source-types"
          />
        </label>
        <label className="field">
          来源平台
          <input
            className="input"
            required
            name="platform"
            defaultValue={source?.platform || "web"}
            list="source-platforms"
          />
        </label>
        <label className="field">
          所属机构
          <select
            className="input"
            name="organizationId"
            defaultValue={source?.organizationId || ""}
          >
            <option value="">独立来源</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        简介
        <textarea
          className="input"
          name="description"
          rows={2}
          defaultValue={source?.description}
        />
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          name="enabled"
          type="checkbox"
          defaultChecked={source?.enabled ?? true}
        />
        启用定期检查（需配置 Feed 地址）
      </label>
      <button className="button secondary" style={{ justifySelf: "start" }}>
        {source ? "保存来源" : "添加来源"}
      </button>
    </form>
  );
}
export default async function SourcesAdmin({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  await requireAuth();
  const [sources, organizations, messages] = await Promise.all([
    prisma.source.findMany({
      include: { _count: { select: { articles: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.organization.findMany({ orderBy: { name: "asc" } }),
    searchParams,
  ]);
  return (
    <main className="page-shell" style={{ paddingTop: 36, paddingBottom: 80 }}>
      <AdminNav />
      <div className="section-heading">
        <div>
          <p className="eyebrow">SOURCE DIRECTORY</p>
          <h1>持续追踪可信的信息源</h1>
          <p className="muted">
            来源独立维护。为支持订阅的网站填写 RSS / Atom
            地址；微信公众号可先通过人工链接导入。
          </p>
        </div>
      </div>
      <AdminNotice {...messages} />
      <datalist id="source-types">
        {[
          "official",
          "research",
          "community",
          "engineering",
          "podcast",
          "repository",
          "documentation",
        ].map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="source-platforms">
        {["web", "arxiv", "github", "wechat", "rss", "podcast"].map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <section className="panel" style={{ padding: 24, marginBottom: 24 }}>
        <details>
          <summary style={{ fontWeight: 600, cursor: "pointer" }}>
            ＋ 添加来源
          </summary>
          <SourceForm organizations={organizations} />
        </details>
      </section>
      <div style={{ display: "grid", gap: 16 }}>
        {sources.map((source) => (
          <section className="panel" key={source.id} style={{ padding: 24 }}>
            <details>
              <summary style={{ cursor: "pointer" }}>
                <strong>{source.name}</strong>
                <span
                  className="muted"
                  style={{ marginLeft: 14, fontSize: 12 }}
                >
                  {source.platform} · {source._count.articles} 条收录 ·{" "}
                  {source.enabled ? "已启用" : "已停用"}
                  {source.feedUrl ? " · 可订阅" : ""}
                </span>
              </summary>
              <SourceForm source={source} organizations={organizations} />
            </details>
          </section>
        ))}
      </div>
    </main>
  );
}
