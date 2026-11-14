import Link from "next/link";
export default function NotFound() {
  return (
    <main className="page-shell empty-state">
      <span className="eyebrow">404 / 未收录的坐标</span>
      <h1>这张图谱里，还没有这一页。</h1>
      <p>资料可能尚未发布，或链接已经变更。</p>
      <Link href="/explore" className="button">
        探索已收录资料 →
      </Link>
    </main>
  );
}
