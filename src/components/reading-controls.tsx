"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Bookmark, Check, Copy } from "lucide-react";
import {
  READING_KEY,
  parseReadingList,
  changeReadingEntry,
  type ReadingEntry,
} from "@/lib/reading-list";
function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener("atlas-reading", notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener("atlas-reading", notify);
  };
}
function snapshot() {
  try {
    return localStorage.getItem(READING_KEY) || "[]";
  } catch {
    return "[]";
  }
}
export function useReadingList() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "[]");
  const entries = useMemo(() => parseReadingList(raw), [raw]);
  function save(next: ReadingEntry[]) {
    localStorage.setItem(READING_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("atlas-reading"));
  }
  return { entries, save };
}
export function ReadingControls({
  article,
}: {
  article: { slug: string; title: string };
}) {
  const { entries, save } = useReadingList();
  const entry = entries.find((e) => e.slug === article.slug);
  const [message, setMessage] = useState("");
  function update(change: Partial<Pick<ReadingEntry, "saved" | "read">>) {
    try {
      save(changeReadingEntry(entries, article, change));
      setMessage("已保存到此浏览器的阅读库");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "当前浏览器无法保存，请检查隐私设置。",
      );
    }
  }
  return (
    <div className="reading-toolbar">
      <div className="actions">
        <button
          className="button secondary"
          aria-pressed={entry?.saved ?? false}
          onClick={() => update({ saved: !entry?.saved })}
        >
          <Bookmark size={14} fill={entry?.saved ? "currentColor" : "none"} />
          {entry?.saved ? "已收藏" : "收藏资料"}
        </button>
        <button
          className="button secondary"
          aria-pressed={entry?.read ?? false}
          onClick={() => update({ read: !entry?.read })}
        >
          <Check size={14} />
          {entry?.read ? "已读" : "标记已读"}
        </button>
        <button
          className="button secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
              setMessage("文章链接已复制");
            } catch {
              setMessage("无法访问剪贴板，请复制浏览器地址栏链接。");
            }
          }}
        >
          <Copy size={14} />
          复制链接
        </button>
      </div>
      <p
        className="muted"
        role="status"
        style={{ fontSize: 11, minHeight: 20, marginTop: 8 }}
      >
        {message || "收藏与已读状态仅保存在当前浏览器，可在「阅读库」导出。"}
      </p>
    </div>
  );
}
