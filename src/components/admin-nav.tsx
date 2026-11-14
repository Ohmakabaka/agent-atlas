import Link from "next/link";
import { logout } from "@/app/admin/login/actions";
export function AdminNav() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 28,
      }}
    >
      <nav
        aria-label="编辑导航"
        style={{
          display: "flex",
          gap: 18,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Link href="/admin">内容管理</Link>
        <Link href="/admin/import">收录资料</Link>
        <Link href="/admin/topics">主题管理</Link>
        <Link href="/admin/audit">操作记录</Link>
        <Link href="/admin/relations">知识关联</Link>
        <Link href="/admin/sources">来源管理</Link>
        <Link href="/admin/jobs">采集记录</Link>
      </nav>
      <form action={logout}>
        <button className="button secondary" type="submit">
          退出
        </button>
      </form>
    </div>
  );
}
