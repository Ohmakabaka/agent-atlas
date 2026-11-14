"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page-shell empty-state">
      <h1>暂时无法加载内容</h1>
      <p>请稍后重试。若刚完成安装，请确认已运行数据库初始化命令。</p>
      <button className="button" onClick={reset}>
        重新加载
      </button>
    </main>
  );
}
