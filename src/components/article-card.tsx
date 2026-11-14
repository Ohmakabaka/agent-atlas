import Link from "next/link";
import { ArrowUpRight, FileText, Github, Radio, BookOpen } from "lucide-react";
import { layers, types, date } from "@/lib/labels";
type CardArticle = {
  slug: string;
  title: string;
  originalTitle: string;
  summary: string;
  type: string;
  layer: string;
  quality: string;
  publishedAt: Date | null;
  source: { name: string } | null;
  topics?: { topic: { slug: string; name: string } }[];
};
export function ArticleCard({
  article: a,
  compact = false,
}: {
  article: CardArticle;
  compact?: boolean;
}) {
  const Icon =
    a.type === "repository"
      ? Github
      : a.type === "podcast"
        ? Radio
        : a.type === "paper"
          ? FileText
          : BookOpen;
  return (
    <article className={`article-card ${compact ? "compact" : ""}`}>
      <div className="article-meta">
        <span className={`layer ${a.layer}`}>{layers[a.layer] ?? a.layer}</span>
        <span>{types[a.type] ?? a.type}</span>
        {a.quality === "curated" && <span className="curated">精选</span>}
      </div>
      <Link className="article-title" href={`/articles/${a.slug}`}>
        <h3>{a.title}</h3>
        <ArrowUpRight size={18} />
      </Link>
      {!compact && (
        <>
          <p className="original-title" lang="en">
            {a.originalTitle}
          </p>
          <p className="article-summary">{a.summary}</p>
          <div className="tags">
            {a.topics?.slice(0, 3).map(({ topic }) => (
              <Link key={topic.slug} href={`/topics/${topic.slug}`}>
                {topic.name}
              </Link>
            ))}
          </div>
        </>
      )}
      <div className="article-footer">
        <span>
          <Icon size={13} />
          {a.source?.name ?? "独立来源"}
        </span>
        <time>{date(a.publishedAt)}</time>
      </div>
    </article>
  );
}
