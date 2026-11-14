import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";
import { articleSnapshot, snapshotDifference } from "@/lib/editor/articles";
import { restoreArticleVersion } from "../../../actions";
import { SubmitButton } from "../../submit-button";
const labels: Record<string, string> = {
  title: "中文标题",
  originalTitle: "原始标题",
  url: "原文链接",
  summary: "中文导读",
  bodyMarkdown: "原创正文",
  audience: "阅读人群",
  authorName: "作者",
  type: "内容类型",
  layer: "资料层次",
  language: "语言",
  quality: "质量",
  status: "审核状态",
  publishedAt: "发布日期",
  sourceId: "来源",
  organizationId: "机构",
  takeaways: "技术要点",
  topicIds: "技术主题",
  personIds: "人物",
  engineeringCase: "工程案例",
};
export default async function History({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ revision?: string; page?: string }>;
}) {
  await requireAuth();
  const { id } = await params;
  const p = await searchParams;
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(p.page || "1", 10) || 1),
  );
  const [article, revisions, total, topics, sources, orgs, people] =
    await Promise.all([
      prisma.article.findUnique({
        where: { id },
        include: { topics: true, people: true, engineeringCase: true },
      }),
      prisma.articleRevision.findMany({
        where: { articleId: id },
        orderBy: { version: "desc" },
        take: 20,
        skip: (page - 1) * 20,
      }),
      prisma.articleRevision.count({ where: { articleId: id } }),
      prisma.topic.findMany(),
      prisma.source.findMany(),
      prisma.organization.findMany(),
      prisma.person.findMany(),
    ]);
  if (!article) notFound();
  const selected = p.revision
    ? await prisma.articleRevision.findFirst({
        where: { id: p.revision, articleId: id },
      })
    : revisions[0];
  const current = articleSnapshot(article) as Record<string, unknown>;
  const old = selected?.snapshot as Record<string, unknown> | undefined;
  const changed = old ? snapshotDifference(old, current) : [];
  const names = new Map(
    [...topics, ...sources, ...orgs, ...people].map((x) => [x.id, x.name]),
  );
  const display = (key: string, value: unknown) => {
    if (value === null || value === undefined) return "未填写";
    if (key.endsWith("Id")) return names.get(String(value)) || String(value);
    if (Array.isArray(value))
      return (
        value
          .map((v) =>
            key.endsWith("Ids") ? names.get(String(v)) || String(v) : String(v),
          )
          .join("\n") || "无"
      );
    return typeof value === "object"
      ? JSON.stringify(value, null, 2)
      : String(value) || "未填写";
  };
  return (
    <main className="page-shell">
      <AdminNav />
      <Link className="muted" href={`/admin/articles/${id}`}>
        ← 返回编辑
      </Link>
      <header className="page-intro" style={{ marginTop: 20 }}>
        <span className="eyebrow">REVISION HISTORY</span>
        <h1>每次修订，都有来处。</h1>
        <p>
          {article.title} · 当前版本 v{article.version} · {total} 条历史快照
        </p>
      </header>
      <div className="two-column">
        <section>
          <div className="panel">
            <h2>
              {selected
                ? `版本 v${selected.version} 与当前版本比较`
                : "暂无历史版本"}
            </h2>
            <p className="muted">
              每次保存前自动保留旧版本。机器草稿与原始元数据不参与恢复；恢复会创建新版本并进入待审核。
            </p>
            {selected && (
              <>
                <p className="notice">
                  记录时间{" "}
                  {selected.createdAt
                    .toISOString()
                    .replace("T", " ")
                    .slice(0, 19)}{" "}
                  UTC · 操作 {selected.reason}
                </p>
                <form action={restoreArticleVersion}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="version" value={article.version} />
                  <input type="hidden" name="revisionId" value={selected.id} />
                  <SubmitButton secondary>
                    恢复 v{selected.version} 为待审核
                  </SubmitButton>
                </form>
              </>
            )}
          </div>
          {old &&
            (changed.length ? (
              changed.map((key) => (
                <section className="panel" key={key}>
                  <h3>{labels[key] || key}</h3>
                  <div className="form-grid">
                    <div>
                      <p className="eyebrow">版本 v{selected!.version}</p>
                      <pre
                        style={{
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                          fontSize: 12,
                          marginTop: 12,
                        }}
                      >
                        {display(key, old[key])}
                      </pre>
                    </div>
                    <div>
                      <p className="eyebrow">当前 v{article.version}</p>
                      <pre
                        style={{
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                          fontSize: 12,
                          marginTop: 12,
                        }}
                      >
                        {display(key, current[key])}
                      </pre>
                    </div>
                  </div>
                </section>
              ))
            ) : (
              <div className="panel">选定快照与当前编辑字段相同。</div>
            ))}
        </section>
        <aside>
          <div className="panel">
            <h3>历史版本</h3>
            {revisions.map((r) => (
              <Link
                className="reading-step"
                key={r.id}
                href={`/admin/articles/${id}/history?revision=${r.id}&page=${page}`}
              >
                <div>
                  <strong>v{r.version}</strong>
                  <p>
                    {r.createdAt.toISOString().slice(0, 19).replace("T", " ")}{" "}
                    UTC
                  </p>
                  <p>{r.reason}</p>
                </div>
              </Link>
            ))}
            {!revisions.length && (
              <p className="muted">保存第一次修订后会生成快照。</p>
            )}
            <nav className="pagination">
              {page > 1 && <Link href={`?page=${page - 1}`}>上一页</Link>}
              <span>
                {page} / {Math.max(1, Math.ceil(total / 20))}
              </span>
              {page * 20 < total && (
                <Link href={`?page=${page + 1}`}>下一页</Link>
              )}
            </nav>
          </div>
        </aside>
      </div>
    </main>
  );
}
