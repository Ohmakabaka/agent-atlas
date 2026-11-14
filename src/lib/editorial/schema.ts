import { z } from "zod";

const unique = (values: string[]) => new Set(values).size === values.length;
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(120);
const httpsUrl = z
  .string()
  .max(2048)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "参考资料必须使用无凭据的 HTTPS 地址");
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value &&
      value <= new Date().toISOString().slice(0, 10)
    );
  }, "来源核查日期必须是真实日期，且不能晚于今天");

export const editorialEntrySchema = z
  .object({
    slug,
    title: z.string().trim().min(5).max(160),
    summary: z.string().trim().min(30).max(1200),
    bodyMarkdown: z.string().trim().min(500).max(40000),
    takeaways: z.array(z.string().trim().min(5).max(500)).min(3).max(8),
    audience: z.string().trim().min(3).max(500),
    topics: z.array(slug).min(1).max(15).refine(unique, "主题不能重复"),
    references: z
      .array(
        z
          .object({
            url: httpsUrl,
            title: z.string().trim().min(2).max(300),
            locator: z.string().trim().min(2).max(1000),
          })
          .strict(),
      )
      .min(3)
      .max(20)
      .refine(
        (values) => unique(values.map((value) => value.url)),
        "参考资料地址不能重复",
      ),
    verifiedAt: calendarDate,
  })
  .strict();

export const editorialPackSchema = z
  .array(editorialEntrySchema)
  .max(500)
  .refine(
    (entries) => unique(entries.map((entry) => entry.slug)),
    "内容包包含重复的 slug",
  );
export type EditorialEntry = z.infer<typeof editorialEntrySchema>;
export const EDITORIAL_REPOSITORY = "https://github.com/Ohmakabaka/agent-atlas";
export const EDITORIAL_AUTHOR = "Agent Atlas · Codex 辅助整理";
export const INITIAL_EDITORIAL_SLUGS = [
  "atlas-workflow-agent-decision",
  "atlas-context-budget",
  "atlas-mcp-tool-boundaries",
  "atlas-memory-lifecycle",
  "atlas-evaluation-regression",
  "atlas-durable-agent-execution",
] as const;

export function editorialOriginalUrl(slugValue: string) {
  return `${EDITORIAL_REPOSITORY}/blob/work/content/guides/${slug.parse(slugValue)}.md`;
}

/** Public attribution only; drafts and raw ingestion payloads stay private. */
export function editorialProvenance(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.origin !== "codex_session") return null;
  const parsed = z
    .object({
      verifiedAt: calendarDate,
      references: editorialEntrySchema.shape.references,
    })
    .safeParse(row);
  return parsed.success ? parsed.data : null;
}
