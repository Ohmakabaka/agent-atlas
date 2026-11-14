ALTER TABLE "Article" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Source" ADD COLUMN "lastSuccessAt" DATETIME;
ALTER TABLE "Source" ADD COLUMN "lastError" TEXT;
ALTER TABLE "Source" ADD COLUMN "etag" TEXT;
ALTER TABLE "Source" ADD COLUMN "lastModified" TEXT;
ALTER TABLE "Source" ADD COLUMN "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 60;
CREATE TABLE "ArticleRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "articleId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "reason" TEXT NOT NULL DEFAULT 'edit',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArticleRevision_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ArticleRevision_articleId_version_key" ON "ArticleRevision"("articleId", "version");
CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "detail" JSONB NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE TABLE "RateLimit" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL,
  "windowStart" DATETIME NOT NULL
);
CREATE TABLE "SyncLease" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "owner" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL
);
