import Link from "next/link";
import { redirect } from "next/navigation";
import { authConfigured, isAuthenticated } from "@/lib/auth";
import { login } from "./actions";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isAuthenticated()) redirect("/admin");
  const { error } = await searchParams;
  const configured = authConfigured();
  const message =
    error === "rate"
      ? "尝试次数过多，请十分钟后再试。"
      : error === "invalid"
        ? "编辑口令不正确，请重试。"
        : error === "config"
          ? "尚未配置编辑口令和会话密钥。"
          : "";
  return (
    <main
      className="page-shell"
      style={{ maxWidth: 560, paddingTop: 64, paddingBottom: 100 }}
    >
      <Link href="/" className="muted">
        ← 返回技术图谱
      </Link>
      <section className="panel" style={{ marginTop: 24, padding: 32 }}>
        <p className="eyebrow">EDITOR WORKSPACE</p>
        <h1>编辑工作台</h1>
        <p className="muted">收录有出处的资料，让知识经过审核再与读者见面。</p>
        {!configured && (
          <div className="notice">
            请在服务器环境中设置至少 12 位的 ADMIN_PASSWORD 和至少 32 位的
            SESSION_SECRET，然后重新启动服务。不要把密钥提交到 Git。
          </div>
        )}
        {message && (
          <p role="alert" className="notice">
            {message}
          </p>
        )}
        <form
          action={login}
          style={{ display: "grid", gap: 16, marginTop: 24 }}
        >
          <label className="field">
            编辑口令
            <input
              className="input"
              type="password"
              name="password"
              autoComplete="current-password"
              maxLength={512}
              required
              disabled={!configured}
            />
          </label>
          <button className="button" disabled={!configured}>
            进入工作台
          </button>
        </form>
        <p className="muted" style={{ fontSize: 12, marginTop: 20 }}>
          仅供受信任的小团队编辑使用。会话有效期为 12 小时。
        </p>
      </section>
    </main>
  );
}
