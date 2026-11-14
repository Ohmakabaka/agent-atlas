export const layers: Record<string, string> = {
  primary: "原始资料",
  community: "中文解读",
  engineering: "工程实践",
};
export const types: Record<string, string> = {
  paper: "研究论文",
  article: "技术文章",
  docs: "官方文档",
  repository: "开源项目",
  podcast: "访谈播客",
};
export const qualities: Record<string, string> = {
  curated: "精选",
  standard: "已收录",
};
export const statuses: Record<string, string> = {
  discovered: "已发现",
  pending_review: "待审核",
  published: "已发布",
  archived: "已归档",
};
export function date(value: Date | string | null | undefined) {
  return value
    ? new Date(value).toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "UTC",
      })
    : "日期待核实";
}
export function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
