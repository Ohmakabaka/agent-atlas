import type { Metadata } from "next";
import Link from "next/link";
import { Navigation } from "@/components/navigation";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Agent Atlas · Agent 技术图谱",
    template: "%s · Agent Atlas",
  },
  description: "从原始研究到工程实践，以问题为起点，探索 AI Agent 的技术演进。",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.dataset.theme=localStorage.getItem('atlas-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){}`,
          }}
        />
        <a className="skip-link" href="#content">
          跳转到主要内容
        </a>
        <Navigation />
        <div id="content">{children}</div>
        <footer className="site-footer">
          <div>
            <Link className="footer-brand" href="/">
              Agent Atlas <span>/</span> 技术图谱
            </Link>
            <p>连接知识的点，理解技术的线。</p>
          </div>
          <div>
            <span>开放知识 · 保留出处 · 持续演进</span>
            <a
              href="https://github.com/Ohmakabaka/agent-atlas"
              target="_blank"
              rel="noopener noreferrer"
            >
              在 GitHub 参与共建 ↗
            </a>
            <small>代码 MIT · 第三方内容版权归原作者所有</small>
          </div>
        </footer>
      </body>
    </html>
  );
}
