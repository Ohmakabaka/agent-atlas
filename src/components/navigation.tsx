"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Compass,
  Search,
  GitBranch,
  Library,
  ArrowUpRight,
  Aperture,
} from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
export function Navigation() {
  const path = usePathname();
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand">
          <span className="brand-symbol">
            <Aperture size={23} />
          </span>
          <span>
            Agent <strong>Atlas</strong>
            <small>技术图谱</small>
          </span>
        </Link>
        <nav aria-label="主导航">
          {[
            ["/", "技术地图", Compass],
            ["/explore", "探索资料", Search],
            ["/timeline", "技术演进", GitBranch],
            ["/sources", "来源目录", Library],
          ].map(([href, label, Icon]) => {
            const I = Icon as typeof Compass;
            return (
              <Link
                key={href as string}
                href={href as string}
                className={path === href ? "active" : ""}
              >
                <I size={16} />
                {label as string}
              </Link>
            );
          })}
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          <Link className="contribute" href="/admin">
            参与共建 <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>
    </header>
  );
}
