export type ReadingEntry = {
  slug: string;
  title: string;
  saved: boolean;
  read: boolean;
  updatedAt: string;
};
export const READING_KEY = "agent-atlas-reading-v1";
export const MAX_READING_ENTRIES = 500;
export function parseReadingList(value: unknown): ReadingEntry[] {
  let data: unknown;
  try {
    data = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return [];
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && "entries" in data
      ? (data as { entries: unknown }).entries
      : [];
  if (!Array.isArray(list)) return [];
  const map = new Map<string, ReadingEntry>();
  for (const item of list.slice(0, MAX_READING_ENTRIES)) {
    if (!item || typeof item !== "object") continue;
    const { slug, title, saved, read, updatedAt } = item;
    if (
      typeof slug !== "string" ||
      !/^[a-z0-9][a-z0-9-]{0,179}$/.test(slug) ||
      typeof title !== "string" ||
      title.length > 500 ||
      typeof saved !== "boolean" ||
      typeof read !== "boolean" ||
      (!saved && !read) ||
      typeof updatedAt !== "string" ||
      !Number.isFinite(Date.parse(updatedAt))
    )
      continue;
    map.set(slug, {
      slug,
      title,
      saved,
      read,
      updatedAt: new Date(updatedAt).toISOString(),
    });
  }
  return [...map.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}
export function changeReadingEntry(
  entries: ReadingEntry[],
  article: { slug: string; title: string },
  change: Partial<Pick<ReadingEntry, "saved" | "read">>,
): ReadingEntry[] {
  const old = entries.find((e) => e.slug === article.slug);
  if (!old && entries.length >= MAX_READING_ENTRIES)
    throw new Error("阅读库已达500条，请先导出并移除部分记录。");
  return parseReadingList([
    {
      ...article,
      saved: old?.saved ?? false,
      read: old?.read ?? false,
      ...change,
      updatedAt: new Date().toISOString(),
    },
    ...entries.filter((e) => e.slug !== article.slug),
  ]);
}
export function mergeReadingLists(
  current: ReadingEntry[],
  incoming: ReadingEntry[],
): ReadingEntry[] {
  const map = new Map(current.map((e) => [e.slug, e]));
  for (const entry of incoming) {
    const old = map.get(entry.slug);
    if (!old || entry.updatedAt > old.updatedAt) map.set(entry.slug, entry);
  }
  if (map.size > MAX_READING_ENTRIES)
    throw new Error("合并后超过500条，请缩小导入范围。");
  return parseReadingList([...map.values()]);
}
