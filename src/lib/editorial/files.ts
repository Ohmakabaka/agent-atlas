import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  EDITORIAL_AUTHOR,
  editorialPackSchema,
  type EditorialEntry,
} from "./schema";

/** Read only bounded local JSON files. Content generation needs no model key. */
export async function readEditorialPack(directory = resolve("data/editorial")) {
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter((file) => file.isFile() && file.name.endsWith(".json"))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (files.length > 50) throw new Error("单次最多读取 50 个内容文件");
  const entries: unknown[] = [];
  let totalBytes = 0;
  for (const file of files) {
    const path = join(directory, file.name);
    const size = (await stat(path)).size;
    totalBytes += size;
    if (size > 2_000_000 || totalBytes > 8_000_000)
      throw new Error("内容包超过文件大小限制");
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!Array.isArray(value))
      throw new Error(`${file.name} 必须包含 JSON 数组`);
    entries.push(...value);
  }
  if (!entries.length) throw new Error("内容目录没有可导入的文章");
  return editorialPackSchema.parse(entries);
}

export function renderEditorialMarkdown(entry: EditorialEntry) {
  return `# ${entry.title}\n\n${entry.summary}\n\n作者：${EDITORIAL_AUTHOR}\n\n来源核查日期：${entry.verifiedAt}\n\n本篇为 Codex 会话辅助撰写的原创技术指南；已核对列出的来源，未标注为人工审核。工程建议与来源陈述应分开理解。\n\n${entry.bodyMarkdown}\n\n## 来源核查记录\n\n${entry.references.map((reference) => `- [${reference.title}](${reference.url})：${reference.locator}`).join("\n")}\n`;
}

export async function writeEditorialMarkdown(
  input: unknown,
  directory = resolve("content/guides"),
) {
  const entries = editorialPackSchema.parse(input);
  await mkdir(directory, { recursive: true });
  for (const entry of entries)
    await writeFile(
      join(directory, `${entry.slug}.md`),
      renderEditorialMarkdown(entry),
      "utf8",
    );
  return entries.length;
}

/** Avoid publishing a canonical source URL whose committed text is missing or stale. */
export async function verifyEditorialMarkdown(
  input: unknown,
  directory = resolve("content/guides"),
) {
  const entries = editorialPackSchema.parse(input);
  for (const entry of entries) {
    const path = join(directory, `${entry.slug}.md`);
    let markdown: string;
    try {
      markdown = await readFile(path, "utf8");
    } catch {
      throw new Error(
        `缺少指南 Markdown 原稿：${entry.slug}；请先运行 content:render 并提交生成文件`,
      );
    }
    if (markdown !== renderEditorialMarkdown(entry))
      throw new Error(
        `指南 Markdown 与内容包不一致：${entry.slug}；请重新运行 content:render 并提交生成文件`,
      );
  }
}
