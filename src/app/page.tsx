import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  Network,
  Layers,
  BrainCircuit,
  Database,
  Wrench,
  Blocks,
  FlaskConical,
  Compass,
  GitBranch,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { getHomeData, getTimeline } from "@/lib/queries";
import { ArticleCard } from "@/components/article-card";
import { date } from "@/lib/labels";
export const dynamic = "force-dynamic";
const icons = [
  Layers,
  BrainCircuit,
  Database,
  Wrench,
  Blocks,
  FlaskConical,
  Compass,
];
export default async function Home() {
  const [d, timeline] = await Promise.all([getHomeData(), getTimeline()]);
  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <div className="eyebrow">A living atlas of agent technology</div>
          <h1>
            从一个问题出发，
            <br />
            探索 <em>Agent 的技术全景。</em>
          </h1>
          <p className="hero-description">
            连接一手研究、社区洞察与工程实践。
            <br />
            让分散的知识，成为可探索、可理解、可实践的技术图谱。
          </p>
          <form action="/explore" className="hero-search">
            <Search size={17} />
            <input
              name="q"
              aria-label="搜索技术、问题或资料"
              placeholder="搜索技术、问题或资料，例如：如何评测 Agent？"
            />
            <button className="button" type="submit">
              开始探索 <ArrowRight size={14} />
            </button>
          </form>
          <div className="hot-search">
            <span>探索热词</span>
            {["Context Engineering", "MCP", "Agent Evals"].map((q) => (
              <Link key={q} href={`/explore?q=${encodeURIComponent(q)}`}>
                {q}
              </Link>
            ))}
          </div>
          <p className="hero-note">
            <span className="status-dot" /> 开放知识计划 · 人工精选与审核 ·
            每一条知识都有出处
          </p>
        </div>
        <div className="constellation" aria-label="Agent 主题关系导航">
          <svg
            className="connections"
            viewBox="0 0 400 290"
            preserveAspectRatio="none"
          >
            <path
              d="M205 142L80 49M205 142L302 38M205 142L342 129M205 142L292 224M205 142L111 230M205 142L39 145"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeDasharray="4 5"
            />
            <circle
              cx="205"
              cy="142"
              r="92"
              fill="none"
              stroke="currentColor"
              strokeDasharray="2 6"
            />
          </svg>
          <Link href="/explore" className="map-node center">
            <Network size={16} /> Agent
          </Link>
          {d.topics.slice(0, 6).map((t, i) => (
            <Link
              key={t.id}
              href={`/topics/${t.slug}`}
              className="map-node"
              style={
                [
                  { left: "5%", top: "10%" },
                  { right: "5%", top: "6%" },
                  { right: "0%", top: "41%" },
                  { right: "6%", bottom: "15%" },
                  { left: "9%", bottom: "13%" },
                  { left: "0%", top: "43%" },
                ][i]
              }
            >
              <span className="status-dot" />
              {t.englishName}
            </Link>
          ))}
          <span className="map-caption">
            CONNECT THE DOTS. BUILD THE CONTEXT.
          </span>
        </div>
      </section>
      <div className="stats-bar">
        <span>
          <strong>{d.topics.length}</strong> 技术方向
        </span>
        <span>
          <strong>{d.topics.reduce((n, t) => n + t.children.length, 0)}</strong>{" "}
          细分主题
        </span>
        <span>
          <strong>{d.count}</strong> 精选资料
        </span>
        <span>
          <strong>{d.sources.length}</strong> 追踪来源
        </span>
        <span className="last">
          <span className="status-dot" /> 知识持续生长中
        </span>
      </div>
      <section>
        <div className="section-heading">
          <div>
            <h2>
              <Network size={20} /> Agent 技术地图{" "}
              <span className="section-label">THE KNOWLEDGE LANDSCAPE</span>
            </h2>
            <p>从你正在解决的问题开始，找到自己的探索路径。</p>
          </div>
          <Link href="/explore">
            浏览全部资料 <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="atlas-grid">
          {d.topics.map((t, i) => {
            const Icon = icons[i % icons.length];
            return (
              <article
                key={t.id}
                className={`topic-card ${i === 6 ? "application-card" : ""}`}
              >
                <div className="topic-card-top">
                  <span className="topic-icon">
                    <Icon size={20} />
                  </span>
                  <span className="topic-number">0{i + 1} / ATLAS</span>
                </div>
                <Link href={`/topics/${t.slug}`}>
                  <h3>{t.name}</h3>
                  <p className="english">{t.englishName}</p>
                </Link>
                <p className="question">{t.question}</p>
                <div className="tags">
                  {t.children.slice(0, 5).map((c) => (
                    <Link key={c.id} href={`/topics/${c.slug}`}>
                      {c.name}
                    </Link>
                  ))}
                  {t.children.length > 5 && (
                    <Link href={`/topics/${t.slug}`}>
                      +{t.children.length - 5}
                    </Link>
                  )}
                </div>
                <Link href={`/topics/${t.slug}`} className="topic-card-bottom">
                  <span>{t.children.length} 个子主题 · 探索方向</span>
                  <ArrowUpRight size={16} />
                </Link>
              </article>
            );
          })}
        </div>
      </section>
      <section>
        <div className="section-heading">
          <div>
            <h2>
              <BookOpen size={20} /> 从这里，读懂一个专题
            </h2>
            <p>沿着整理好的阅读路径，从技术原理走向工程落地。</p>
          </div>
          <span className="eyebrow">EDITOR'S PATH</span>
        </div>
        <div className="feature-grid">
          {d.featuredTopics.slice(0, 3).map((t, i) => (
            <Link key={t.id} href={`/topics/${t.slug}`} className="feature">
              <span className="feature-index">PATH 0{i + 1} ↗</span>
              <h3>{t.name}</h3>
              <p>{t.question}</p>
              <span className="feature-link">
                概念 · 原始资料 · 实践路径 <ArrowRight size={14} />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <div className="content-columns">
        <section>
          <div className="section-heading">
            <div>
              <h2>值得读的新资料</h2>
              <p>保留原始出处，提供中文导读。</p>
            </div>
            <Link href="/explore">
              全部资料 <ArrowRight size={13} />
            </Link>
          </div>
          <div className="article-list">
            {d.latest.slice(0, 4).map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
          <div className="section-heading">
            <h2>工程现场</h2>
            <Link href="/explore?layer=engineering">
              查看实践 <ArrowRight size={13} />
            </Link>
          </div>
          <div className="article-list">
            {d.engineering.map((a) => (
              <ArticleCard key={a.id} article={a} compact />
            ))}
          </div>
        </section>
        <aside>
          <div className="section-heading">
            <h2>知识从哪里来</h2>
          </div>
          <div className="side-panel">
            <p className="muted" style={{ fontSize: 11, marginBottom: 5 }}>
              关注原始声音，连接多元视角。
            </p>
            {d.sources
              .filter((s) => s._count.articles > 0)
              .slice(0, 5)
              .map((s) => (
                <Link
                  key={s.id}
                  href={`/explore?source=${s.slug}`}
                  className="source-mini"
                >
                  <span className="source-avatar">
                    {s.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <strong>{s.name}</strong>
                    <small>{s._count.articles} 条已收录资料</small>
                  </div>
                  <ArrowUpRight size={13} />
                </Link>
              ))}
            <Link
              href="/sources"
              className="feature-link"
              style={{
                display: "block",
                marginTop: 15,
                fontSize: 11,
                color: "var(--accent)",
              }}
            >
              浏览完整来源目录 →
            </Link>
          </div>
          <div className="section-heading">
            <h2>
              <GitBranch size={18} /> 演进中的技术
            </h2>
          </div>
          <div className="side-panel">
            {timeline.slice(0, 4).map((a) => (
              <div key={a.id} className="timeline-mini">
                <small>{date(a.publishedAt)}</small>
                <Link href={`/articles/${a.slug}`}>
                  <p>{a.title}</p>
                </Link>
              </div>
            ))}
            <Link
              href="/timeline"
              style={{ fontSize: 11, color: "var(--accent)" }}
            >
              沿时间线探索 →
            </Link>
          </div>
          <div
            className="side-panel"
            style={{ marginTop: 20, background: "var(--soft)" }}
          >
            <Sparkles size={20} color="var(--accent)" />
            <h3 style={{ marginTop: 13 }}>好的知识，值得被连接。</h3>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.9 }}>
              发现一篇好文章，补充一个工程案例，或纠正一处内容。和我们一起完善这张图谱。
            </p>
            <a
              className="button secondary"
              style={{ marginTop: 18 }}
              href="https://github.com/Ohmakabaka/agent-atlas/issues/new"
              target="_blank"
              rel="noopener noreferrer"
            >
              贡献一条线索 <ArrowUpRight size={13} />
            </a>
          </div>
        </aside>
      </div>
    </main>
  );
}
