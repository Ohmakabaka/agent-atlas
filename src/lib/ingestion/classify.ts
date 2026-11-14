export interface ClassifiableTopic { id: string; slug: string; name: string; englishName: string; }
const aliases: Record<string, string[]> = {
  'agent-evals': ['evals', 'evaluation', '评测', '评估'],
  'context-engineering': ['context engineering', '上下文工程'],
  'mcp': ['model context protocol', 'mcp'],
  'rag': ['retrieval augmented generation', 'retrieval-augmented', 'rag', '检索增强'],
  'react': ['react:', 'reasoning and acting', '推理与行动'],
  'agent-harness': ['harness', 'agent harness'],
  'tool-use': ['tool use', 'function calling', '工具调用'],
  'multi-agent': ['multi-agent', 'multi agent', '多智能体'],
  'memory': ['memory', '记忆'],
};
/** Deterministic suggestions only: never establish a reviewed knowledge relation. */
export function suggestTopics(text: string, topics: ClassifiableTopic[]) {
  const haystack = text.normalize('NFKC').toLowerCase();
  return topics.map(topic => {
    const terms = [...new Set([topic.name, topic.englishName, ...(aliases[topic.slug] || [])].map(t => t.toLowerCase()))];
    const matched = terms.filter(term => term.length > 1 && haystack.includes(term));
    return {...topic, score: matched.length, matched};
  }).filter(topic => topic.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
}
