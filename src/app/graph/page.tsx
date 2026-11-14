import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getKnowledgeGraph } from "@/lib/queries";
import { relationLabels } from "@/lib/search/relations";
import { siteOrigin } from "@/lib/search/seo";
import { KnowledgeGraph } from "@/components/knowledge-graph";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "知识关系图谱",
  description:
    "沿着经审核的技术关系探索 Agent 主题、论文与工程实践，每条关系保留依据。",
  ...(siteOrigin()
    ? { alternates: { canonical: `${siteOrigin()}/graph` } }
    : {}),
};
export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; type?: string }>;
}) {
  const params = await searchParams;
  const topic = typeof params.topic === "string" ? params.topic : undefined;
  const type =
    typeof params.type === "string" &&
    Object.hasOwn(relationLabels, params.type)
      ? params.type
      : undefined;
  const [data, topics] = await Promise.all([
    getKnowledgeGraph({ topic, type }),
    prisma.topic.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  return (
    <main className="page-shell">
      <header className="page-intro">
        <span className="eyebrow">KNOWLEDGE CONNECTIONS</span>
        <h1>每一条连接，都有依据。</h1>
        <p>
          从技术主题走向论文、协议和工程实现。只展示人工确认的关系；前置知识、技术扩展与一般主题关联分别标记，不将共同主题推断为直接继承。
        </p>
      </header>
      <form
        action="/graph"
        className="panel form-grid"
        style={{ alignItems: "end" }}
      >
        <label className="field">
          技术主题
          <select name="topic" defaultValue={topic || ""}>
            <option value="">全部主题</option>
            {topics.map((t) => (
              <option value={t.slug} key={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          关系类型
          <select name="type" defaultValue={type || ""}>
            <option value="">全部关系</option>
            {Object.entries(relationLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label} · {value}
              </option>
            ))}
          </select>
        </label>
        <div className="actions">
          <button className="button" type="submit">
            筛选关系
          </button>
          <Link href="/graph" className="button secondary">
            清除筛选
          </Link>
        </div>
      </form>
      <KnowledgeGraph data={data} />
    </main>
  );
}
