"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReadingList } from "@/components/reading-controls";
import {
  changeReadingEntry,
  mergeReadingLists,
  parseReadingList,
} from "@/lib/reading-list";
import { ArticleCard } from "@/components/article-card";
import type { ComponentProps } from "react";
type LibraryArticle = ComponentProps<typeof ArticleCard>["article"];
export function ReadingLibrary() {
  const { entries, save } = useReadingList();
  const [filter, setFilter] = useState("saved");
  const [q, setQ] = useState("");
  const [articles, setArticles] = useState<LibraryArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const slugs = entries
    .map((e) => e.slug)
    .sort()
    .join(",");
  useEffect(() => {
    const controller = new AbortController();
    if (!slugs) {
      setArticles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const ids = slugs.split(",");
    (async () => {
      const found: LibraryArticle[] = [];
      for (let i = 0; i < ids.length; i += 50) {
        const r = await fetch(
          "/api/library?slugs=" +
            encodeURIComponent(ids.slice(i, i + 50).join(",")),
          { signal: controller.signal },
        );
        if (!r.ok) throw new Error("暂时无法读取资料，请稍后刷新重试。");
        const data = await r.json();
        found.push(...data.articles);
      }
      setArticles(found);
    })()
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [slugs]);
  const visible = useMemo(
    () =>
      entries.filter(
        (e) =>
          (filter === "all" ||
            (filter === "saved"
              ? e.saved
              : filter === "unread"
                ? e.saved && !e.read
                : e.read)) &&
          e.title.toLowerCase().includes(q.toLowerCase()),
      ),
    [entries, filter, q],
  );
  function write(next: typeof entries) {
    try {
      save(next);
      setNotice("阅读库已更新");
    } catch {
      setError("浏览器存储不可用，请先导出备份。");
    }
  }
  function exportList() {
    const blob = new Blob(
      [
        JSON.stringify(
          { version: 1, exportedAt: new Date().toISOString(), entries },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "agent-atlas-reading.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <div className="library-tools">
        <div className="filter-tabs" role="group" aria-label="阅读状态">
          {[
            ["saved", "收藏"],
            ["unread", "待阅读"],
            ["read", "已读"],
            ["all", "全部"],
          ].map(([value, label]) => (
            <button
              className={filter === value ? "selected" : ""}
              key={value}
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="actions">
          <button className="button secondary" onClick={exportList}>
            导出阅读库
          </button>
          <button
            className="button secondary"
            onClick={() => file.current?.click()}
          >
            导入备份
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="导入阅读库文件"
            onChange={async (e) => {
              const input = e.currentTarget;
              const f = input.files?.[0];
              if (!f) return;
              try {
                if (f.size > 1000000) throw new Error("文件不能超过1MB");
                const raw = JSON.parse(await f.text());
                if (
                  !raw ||
                  raw.version !== 1 ||
                  !Array.isArray(raw.entries) ||
                  raw.entries.length > 500
                )
                  throw new Error("不是有效的阅读库备份（最多500条）");
                const valid = parseReadingList(raw);
                if (valid.length !== raw.entries.length)
                  throw new Error("备份包含无效或重复记录，未导入");
                save(mergeReadingLists(entries, valid));
                setNotice(`已合并${valid.length}条阅读记录`);
                setError("");
              } catch (err) {
                setError(err instanceof Error ? err.message : "导入失败");
              } finally {
                input.value = "";
              }
            }}
          />
        </div>
      </div>
      <input
        type="search"
        className="input"
        aria-label="搜索阅读库"
        placeholder="在收藏与阅读记录中搜索标题…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ margin: "20px 0" }}
      />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <p className="results-count">
        {visible.length} 条记录 · 不上传个人阅读状态到服务器
      </p>
      {loading ? (
        <div
          className="skeleton"
          style={{ height: 160 }}
          aria-label="加载阅读库"
        />
      ) : (
        <div className="article-list">
          {visible.map((e) => {
            const a = articles.find((a) => a.slug === e.slug);
            return (
              <div key={e.slug}>
                {a ? (
                  <ArticleCard article={a} />
                ) : (
                  <div className="panel">
                    <h3>{e.title}</h3>
                    <p className="muted">
                      {error
                        ? "资料状态暂不可用"
                        : "此资料已归档或暂未公开。阅读记录仍保留。"}
                    </p>
                  </div>
                )}
                <div className="actions" style={{ margin: "8px 0 20px" }}>
                  <button
                    className="button secondary"
                    onClick={() =>
                      write(changeReadingEntry(entries, e, { read: !e.read }))
                    }
                  >
                    {e.read ? "设为未读" : "标记已读"}
                  </button>
                  <button
                    className="button secondary"
                    onClick={() =>
                      write(changeReadingEntry(entries, e, { saved: !e.saved }))
                    }
                  >
                    {e.saved ? "取消收藏" : "收藏"}
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => {
                      if (window.confirm("移除此条收藏与已读记录？"))
                        write(entries.filter((x) => x.slug !== e.slug));
                    }}
                  >
                    移除记录
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!loading && !visible.length && (
        <div className="panel empty-state">
          <h2>
            {entries.length
              ? "没有符合条件的阅读记录"
              : "你的阅读库，从一篇好资料开始。"}
          </h2>
          <p>在文章页点击“收藏资料”或“标记已读”，就能在这里继续阅读。</p>
          <Link className="button" href="/explore">
            探索资料 →
          </Link>
        </div>
      )}
    </>
  );
}
