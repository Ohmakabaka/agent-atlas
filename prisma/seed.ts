import { Prisma } from '@prisma/client';
import { createDb } from '../src/lib/db';
import { loadEnvFile } from 'node:process';
import organizations from '../data/organizations.json';
import sources from '../data/sources.json';
import topics from '../data/topics.json';
import articles from '../data/articles.json';
import relations from '../data/relations.json';
import people from '../data/people.json';

try { loadEnvFile(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const db = createDb();
async function main() {
  // Empty updates make seeding repeatable without overwriting editors' changes.
  // Transactions keep imported entities and their relationships consistent.
  await db.$transaction(async (tx) => {
    for (const row of organizations) await tx.organization.upsert({ where: { slug: row.slug }, update: {}, create: row });
    for (const row of sources) await tx.source.upsert({ where: { slug: row.slug }, update: {}, create: row });
    for (const row of topics) await tx.topic.upsert({ where: { slug: row.slug }, update: {}, create: row });
    for (const entry of articles) {
      const { topics: slugs, engineeringCase, ...row } = entry;
      const existing = await tx.article.findUnique({ where: { canonicalUrl: row.canonicalUrl } });
      if (existing) continue;
      const article = await tx.article.create({ data: {
        ...row,
        publishedAt: row.publishedAt ? new Date(row.publishedAt) : null,
        reviewedAt: new Date('2026-11-13T00:00:00Z'),
        rawMetadata: { title: row.originalTitle, url: row.url, author: row.authorName, publishedAt: row.publishedAt, provenance: '人工整理的公开资料元数据；无原文全文' },
        aiDraft: {},
        topics: { create: slugs.map(slug => ({ topic: { connect: { slug } } })) },
        links: { create: { url: row.url, label: '原始资料' } },
        ...(engineeringCase ? { engineeringCase: { create: { ...engineeringCase, evidenceUrl: row.url } } } : {}),
      } });
      console.log(`Seeded: ${article.slug}`);
    }
    for (const row of relations) await tx.relation.upsert({ where: { id: row.id }, update: {}, create: row });
    for (const entry of people) {
      const { articleSlugs, ...row } = entry;
      await tx.person.upsert({ where: { id: row.id }, update: {}, create: { ...row, articles: { create: articleSlugs.map(slug => ({ article: { connect: { slug } } })) } } });
    }
  }, { timeout: 30000 });
  console.log(JSON.stringify({ topics: await db.topic.count(), articles: await db.article.count(), sources: await db.source.count(), relations: await db.relation.count() }));
}
main().catch((error: unknown) => { console.error(error instanceof Prisma.PrismaClientKnownRequestError ? error.message : error); process.exitCode = 1; }).finally(() => db.$disconnect());
