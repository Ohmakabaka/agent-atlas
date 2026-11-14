export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import Link from "next/link";
import { siteOrigin } from "@/lib/search/seo";
export const metadata: Metadata = {
  title: "关于图谱与编辑准则",
  description: "Agent Atlas 的收录标准、资料分层、关系证据与内容贡献方式。",
};
export default function About() {
  return (
    <main className="page-shell">
      <header className="page-intro">
        <span className="eyebrow">KNOWLEDGE WITH PROVENANCE</span>
        <h1>让知识有出处，让关联有依据。</h1>
        <p>
          Agent Atlas
          是面向中文开发者的开放技术知识库。我们以工程问题组织研究和实践，帮助你理解技术为什么出现，以及何时值得使用。
        </p>
      </header>
      <div className="two-column">
        <div>
          <section className="panel prose">
            <h2>三种资料，三种阅读视角</h2>
            <p>
              <strong>原始资料</strong>
              保留论文、协议、官方文档及发布的原始标题和链接；
              <strong>中文解读</strong>补充社区的理解、争议与学习路径；
              <strong>工程实践</strong>关注明确的问题、架构、方案与效果边界。
            </p>
            <p>
              中文导读由编辑整理，不代表原作者立场，也不是原文全文翻译。未知日期和缺失信息应明确标示，不补造实验结果。
            </p>
          </section>
          <section className="panel prose">
            <h2>什么值得收录</h2>
            <ul>
              <li>能够核实出处，直接解释Agent技术或具体工程问题。</li>
              <li>区分事实、经验与观点，对收益和限制提供上下文。</li>
              <li>有可访问的原始链接；转载应追溯原出处，保留补充链接。</li>
              <li>精选标识是编辑推荐，不代替对研究结论的独立判断。</li>
            </ul>
            <p>
              自动采集和机器建议一律进入待审核流程。机器草稿需经人工核对，才能作为公开内容展示。
            </p>
          </section>
          <section className="panel prose">
            <h2>一条连接，不等于一次技术继承</h2>
            <p>
              共同讨论一个主题，只支持一般主题关联。明确引用、扩展、质疑或技术演进关系需要独立证据。图谱公开展示已确认的关系及依据；时间线的先后顺序只提供浏览线索。
            </p>
            <Link href="/graph">探索有依据的知识关联 →</Link>
          </section>
          <section className="panel prose">
            <h2>纠错与内容版权</h2>
            <p>
              欢迎通过GitHub提交资料线索、事实纠错或失效链接，并附上可核对的原始依据。正文导读、主题和关系均可持续修订。
            </p>
            <p>
              项目代码采用MIT许可。所链接文章、论文、图片、商标与项目遵循原权利人许可；链接收录不改变第三方内容的版权。我们默认不采集和重新发布第三方全文。
            </p>
            <a
              href="https://github.com/Ohmakabaka/agent-atlas/issues/new"
              target="_blank"
              rel="noopener noreferrer"
            >
              提交线索或纠错 ↗
            </a>
          </section>
        </div>
        <aside>
          <div className="panel">
            <h3>开始自己的阅读路径</h3>
            <p className="muted" style={{ fontSize: 12 }}>
              从技术主题探索，用阅读库收藏值得再读的资料。
            </p>
            <div className="actions">
              <Link className="button" href="/">
                技术地图
              </Link>
              <Link className="button secondary" href="/library">
                我的阅读库
              </Link>
            </div>
          </div>
          {siteOrigin() && (
            <div className="panel">
              <h3>订阅更新</h3>
              <p className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
                通过RSS订阅最近收录的已审核中文导读。
              </p>
              <a href="/feed.xml" className="button secondary">
                RSS订阅 →
              </a>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
