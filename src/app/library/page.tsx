import type { Metadata } from "next";
import { ReadingLibrary } from "./reading-library";
export const metadata: Metadata = {
  title: "我的阅读库",
  robots: { index: false, follow: false },
};
export default function Library() {
  return (
    <main className="page-shell">
      <header className="page-intro">
        <span className="eyebrow">YOUR READING SPACE</span>
        <h1>把值得读的，留给自己。</h1>
        <p>
          收藏与阅读进度保存在这台设备的浏览器中，无需注册。导出文件可以备份或迁移到其他设备。
        </p>
      </header>
      <ReadingLibrary />
    </main>
  );
}
