import { Prisma } from "@prisma/client";

export const searchSorts = {
  relevance: "相关度优先",
  newest: "发布时间：从新到旧",
  oldest: "发布时间：从旧到新",
} as const;
export type SearchSort = keyof typeof searchSorts;
export function normalizeSearch(input?: string) {
  const query = (input || "")
    .normalize("NFKC")
    .trim()
    .slice(0, 200)
    .toLowerCase();
  return {
    query,
    terms: [...new Set(query.split(/\s+/).filter(Boolean))].slice(0, 12),
  };
}
export function resolveSearchSort(
  input: string | undefined,
  hasQuery: boolean,
): SearchSort {
  return input && Object.hasOwn(searchSorts, input)
    ? (input as SearchSort)
    : hasQuery
      ? "relevance"
      : "newest";
}
/** Values are parameter-bound. SQL identifiers and weights are constants, never user input. */
export function keywordSql(terms: string[], phrase: string) {
  const topicMatch = (term: string) =>
    Prisma.sql`EXISTS (SELECT 1 FROM "ArticleTopic" at JOIN "Topic" t ON t.id = at."topicId" WHERE at."articleId" = a.id AND (instr(lower(t.name), ${term}) > 0 OR instr(lower(t."englishName"), ${term}) > 0))`;
  const matches = terms.map(
    (term) =>
      Prisma.sql`(instr(lower(a.title), ${term}) > 0 OR instr(lower(a."originalTitle"), ${term}) > 0 OR instr(lower(a.summary), ${term}) > 0 OR instr(lower(a."bodyMarkdown"), ${term}) > 0 OR instr(lower(a."authorName"), ${term}) > 0 OR ${topicMatch(term)})`,
  );
  const scores = terms.map(
    (term) =>
      Prisma.sql`(CASE WHEN instr(lower(a.title), ${term}) > 0 THEN 100 ELSE 0 END + CASE WHEN instr(lower(a."originalTitle"), ${term}) > 0 THEN 80 ELSE 0 END + CASE WHEN ${topicMatch(term)} THEN 45 ELSE 0 END + CASE WHEN instr(lower(a."authorName"), ${term}) > 0 THEN 15 ELSE 0 END + CASE WHEN instr(lower(a.summary), ${term}) > 0 THEN 8 ELSE 0 END + CASE WHEN instr(lower(a."bodyMarkdown"), ${term}) > 0 THEN 3 ELSE 0 END)`,
  );
  return {
    match: matches.length ? Prisma.join(matches, " AND ") : Prisma.sql`1 = 1`,
    score: scores.length
      ? Prisma.sql`(CASE WHEN lower(a.title) = ${phrase} OR lower(a."originalTitle") = ${phrase} THEN 200 ELSE 0 END + ${Prisma.join(scores, " + ")})`
      : Prisma.sql`0`,
  };
}
