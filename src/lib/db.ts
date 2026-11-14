import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { resolve } from 'node:path';

/** Match Prisma's convention: relative SQLite URLs resolve beneath prisma/. */
export function databaseUrl(configured = process.env.DATABASE_URL || 'file:./dev.db') {
  return configured.startsWith('file:') ? `file:${resolve(process.cwd(), 'prisma', configured.slice(5))}` : configured;
}
export function createDb(url = databaseUrl()) { return new PrismaClient({ adapter: new PrismaLibSQL({ url }) }); }
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? createDb();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
export default prisma;
