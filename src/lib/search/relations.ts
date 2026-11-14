export const relationLabels: Record<string, string> = {
  explains: "解释技术",
  implements: "实现技术",
  discusses: "讨论技术",
  compares_with: "比较方案",
  references: "明确引用",
  extends: "扩展工作",
  challenges: "提出质疑",
  related_to: "主题关联",
  prerequisite_for: "前置知识",
  evolves_from: "演进自",
};
export type GraphNode = {
  id: string;
  kind: "topic" | "article";
  label: string;
  href: string;
};
export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  type: string;
  description: string;
  evidenceUrl: string | null;
};
export type KnowledgeGraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  total: number;
};
