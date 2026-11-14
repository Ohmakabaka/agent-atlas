import Link from "next/link";
import { Search } from "lucide-react";
import { searchArticles } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { layers, types, qualities } from "@/lib/labels";
import { ArticleCard } from "@/components/article-card";
export const dynamic = "force-dynamic";
type Params = Record<string, string | string[] | undefined>;
export default async function Explore({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const raw = await searchParams;
  const p = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v : ""]),
  );
  const [r, topics, sources, orgs] = await Promise.all([
    searchArticles({ ...p, page: Number(p.page) || 1 }),
    prisma.topic.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.source.findMany({ orderBy: { name: "asc" } }),
    prisma.organization.findMany({ orderBy: { name: "asc" } }),
  ]);
  const options = (
    name: string,
    label: string,
    items: { value: string; label: string }[],
  ) => (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={p[name] || ""}>
        <option value="">全部{label}</option>
        {items.map((i) => (
          <option key={i.value} value={i.value}>
            {i.label}
          </option>
        ))}
      </select>
    </div>
  );
  const dict = (x: Record<string, string>) =>
    Object.entries(x).map(([value, label]) => ({ value, label }));
  function pageUrl(page: number) {
    const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v));
    q.set("page", String(page));
    return `/explore?${q}`;
  }
  return (
    <main className="page-shell">
      <header className="page-intro">
        <span className="eyebrow">EXPLORE THE KNOWLEDGE</span>
        <h1>发现问题背后的知识。</h1>
        <p>跨越机构、语言和内容形式，找到真正有用的资料。</p>
      </header>
      <div className="filter-layout">
        <aside className="panel filter-panel">
          <h3>缩小探索范围</h3>
          <form action="/explore">
            <div className="field">
              <label htmlFor="q">关键词</label>
              <input
                id="q"
                name="q"
                type="text"
                defaultValue={p.q}
                placeholder="中文 / English"
                maxLength={200}
              />
            </div>
            {options(
              "topic",
              "技术主题",
              topics.map((t) => ({ value: t.slug, label: t.name })),
            )}
            {options(
              "organization",
              "来源机构",
              orgs.map((o) => ({ value: o.slug, label: o.name })),
            )}
            {options(
              "source",
              "内容来源",
              sources.map((s) => ({ value: s.slug, label: s.name })),
            )}
            {options(
              "platform",
              "来源平台",
              [...new Set(sources.map((s) => s.platform))].map((s) => ({
                value: s,
                label: s,
              })),
            )}
            {options("type", "内容类型", dict(types))}
            {options("layer", "资料层次", dict(layers))}
            {options("language", "语言", [
              { value: "zh", label: "中文" },
              { value: "en", label: "英文" },
            ])}
            {options("quality", "质量等级", dict(qualities))}
            <div className="field">
              <label htmlFor="from">发布起始日期</label>
              <input id="from" type="date" name="from" defaultValue={p.from} />
            </div>
            <div className="field">
              <label htmlFor="to">发布截止日期</label>
              <input id="to" type="date" name="to" defaultValue={p.to} />
            </div>
            <button
              className="button"
              style={{ width: "100%", marginTop: 8 }}
              type="submit"
            >
              <Search size={14} />
              应用筛选
            </button>
            <Link
              href="/explore"
              className="button secondary"
              style={{ width: "100%", marginTop: 8 }}
            >
              清除筛选
            </Link>
          </form>
        </aside>
        <section>
          <form action="/explore" className="search-large">
            {Object.entries(p)
              .filter(([k, v]) => k !== "q" && k !== "page" && v)
              .map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
            <input
              aria-label="搜索资料"
              className="input"
              name="q"
              defaultValue={p.q}
              placeholder="搜索标题、中文导读、作者或技术主题…"
              maxLength={200}
            />
            <button type="submit" className="button">
              搜索
            </button>
          </form>
          <p className="results-count">
            找到 <strong style={{ color: "var(--ink)" }}>{r.total}</strong>{" "}
            条已审核资料 {p.q && <> · “{p.q}”</>}
            <span style={{ float: "right" }}>按原文发布日期排序</span>
          </p>
          {r.articles.length ? (
            <div className="article-list">
              {r.articles.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          ) : (
            <div className="panel empty-state">
              <Search
                size={28}
                style={{ margin: "auto", color: "var(--muted)" }}
              />
              <h2>还没有匹配的资料</h2>
              <p>试试更短的关键词，或减少筛选条件。</p>
              <Link className="button secondary" href="/explore">
                查看全部资料
              </Link>
            </div>
          )}
          {r.pages > 1 && (
            <nav className="pagination" aria-label="分页">
              {r.page > 1 && <Link href={pageUrl(r.page - 1)}>← 上一页</Link>}
              <span>
                {r.page} / {r.pages}
              </span>
              {r.page < r.pages && (
                <Link href={pageUrl(r.page + 1)}>下一页 →</Link>
              )}
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}
