-- Keep existing editorial summaries and revisions intact.
ALTER TABLE "Article" ADD COLUMN "bodyMarkdown" TEXT NOT NULL DEFAULT '';
