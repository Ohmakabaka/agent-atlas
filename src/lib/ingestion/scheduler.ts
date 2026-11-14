import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { ingestItem } from "./index";
import { parseFeed } from "./adapters";
import { safeFetch, type SafeResponse, type RequestOptions } from "./network";

const LEASE_MS = 120_000;
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message.slice(0, 500) : "采集失败";
export type SyncOptions = {
  sourceId?: string;
  force?: boolean;
  signal?: AbortSignal;
};
export type SyncResult = {
  sources: number;
  imported: number;
  duplicates: number;
  skipped: number;
  notModified: number;
  errors: Array<{ source: string; message: string }>;
};
export type FeedFetcher = (
  url: string,
  redirects?: number,
  options?: RequestOptions,
) => Promise<SafeResponse>;

export function sourceIsDue(
  source: { lastCheckedAt: Date | null; syncIntervalMinutes: number },
  now = new Date(),
) {
  return (
    !source.lastCheckedAt ||
    now.getTime() - source.lastCheckedAt.getTime() >=
      Math.max(1, source.syncIntervalMinutes) * 60_000
  );
}

export async function acquireLease(
  key: string,
  owner: string,
  now = new Date(),
) {
  await prisma.syncLease.deleteMany({
    where: { key, expiresAt: { lte: now } },
  });
  try {
    await prisma.syncLease.create({
      data: { key, owner, expiresAt: new Date(now.getTime() + LEASE_MS) },
    });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return false;
    throw error;
  }
}
async function renewLease(key: string, owner: string) {
  const now = new Date();
  const result = await prisma.syncLease.updateMany({
    where: { key, owner, expiresAt: { gt: now } },
    data: { expiresAt: new Date(now.getTime() + LEASE_MS) },
  });
  if (result.count !== 1) throw new Error("任务租约已失效，请重新执行采集");
}
export async function releaseLease(key: string, owner: string) {
  await prisma.syncLease.deleteMany({ where: { key, owner } });
}

/** A fetcher can be injected in tests; production always uses the SSRF-protected transport. */
export async function runSourceSync(
  options: SyncOptions = {},
  fetcher: FeedFetcher = safeFetch,
): Promise<SyncResult> {
  const sources = await prisma.source.findMany({
    where: {
      enabled: true,
      feedUrl: { not: null },
      ...(options.sourceId ? { id: options.sourceId } : {}),
    },
    orderBy: { name: "asc" },
  });
  const result: SyncResult = {
    sources: sources.length,
    imported: 0,
    duplicates: 0,
    skipped: 0,
    notModified: 0,
    errors: [],
  };
  for (const source of sources) {
    if (options.signal?.aborted) break;
    if (!options.force && !sourceIsDue(source)) {
      result.skipped++;
      continue;
    }
    const key = `feed:${source.id}`,
      owner = randomUUID();
    if (!(await acquireLease(key, owner))) {
      result.skipped++;
      continue;
    }
    let jobId: string | undefined;
    let imported = 0,
      duplicates = 0;
    try {
      // A successfully acquired lease means old running jobs no longer own this source.
      await prisma.ingestionJob.updateMany({
        where: {
          sourceId: source.id,
          status: "running",
          startedAt: { lt: new Date(Date.now() - LEASE_MS) },
        },
        data: {
          status: "interrupted",
          finishedAt: new Date(),
          error: "前次进程未完成，租约已回收；本次重新检查来源。",
        },
      });
      const job = await prisma.ingestionJob.create({
        data: {
          adapter: "rss",
          sourceId: source.id,
          details: {
            trigger: options.force ? "manual" : "scheduled",
            feedUrl: source.feedUrl,
          },
        },
      });
      jobId = job.id;
      await prisma.source.update({
        where: { id: source.id },
        data: { lastCheckedAt: new Date() },
      });
      const headers: Record<string, string> = {};
      if (source.etag) headers["If-None-Match"] = source.etag;
      if (source.lastModified)
        headers["If-Modified-Since"] = source.lastModified;
      const response = await fetcher(source.feedUrl!, 0, {
        headers,
        allowNotModified: true,
        signal: options.signal,
      });
      await renewLease(key, owner);
      if (response.status === 304) {
        result.notModified++;
        await prisma.source.update({
          where: { id: source.id },
          data: { lastSuccessAt: new Date(), lastError: null },
        });
        await prisma.ingestionJob.update({
          where: { id: job.id },
          data: {
            status: "not_modified",
            finishedAt: new Date(),
            details: { httpStatus: 304, feedUrl: source.feedUrl },
          },
        });
        continue;
      }
      const items = await parseFeed(response.text);
      const errors: Array<{ url: string; message: string }> = [];
      for (const [i, item] of items.entries()) {
        if (options.signal?.aborted)
          throw new Error(
            "进程收到停止信号，任务中断；后续重试会跳过已收录链接。",
          );
        if (i % 5 === 0) await renewLease(key, owner);
        try {
          const entry = await ingestItem({ ...item, sourceId: source.id });
          if (entry.duplicate) duplicates++;
          else imported++;
        } catch (error) {
          errors.push({ url: item.url, message: errorMessage(error) });
        }
      }
      for (const error of errors)
        result.errors.push({ source: source.name, message: error.message });
      await prisma.source.update({
        where: { id: source.id },
        data: {
          lastError: errors.length
            ? errors
                .map((e) => e.message)
                .join("; ")
                .slice(0, 2000)
            : null,
          ...(!errors.length
            ? {
                etag: response.etag || null,
                lastModified: response.lastModified || null,
                lastSuccessAt: new Date(),
              }
            : {}),
        },
      });
      await prisma.ingestionJob.update({
        where: { id: job.id },
        data: {
          status: errors.length ? "completed_with_errors" : "completed",
          finishedAt: new Date(),
          imported,
          duplicates,
          failed: errors.length,
          error: errors.length
            ? errors
                .map((e) => e.message)
                .join("; ")
                .slice(0, 2000)
            : null,
          details: {
            httpStatus: response.status,
            feedUrl: source.feedUrl,
            items: items.length,
            errors,
          },
        },
      });
    } catch (error) {
      const message = errorMessage(error);
      result.errors.push({ source: source.name, message });
      await prisma.source.update({
        where: { id: source.id },
        data: { lastError: message },
      });
      if (jobId)
        await prisma.ingestionJob.update({
          where: { id: jobId },
          data: {
            status: options.signal?.aborted ? "interrupted" : "failed",
            finishedAt: new Date(),
            failed: 1,
            imported,
            duplicates,
            error: message,
          },
        });
    } finally {
      result.imported += imported;
      result.duplicates += duplicates;
      await releaseLease(key, owner);
    }
  }
  return result;
}
export async function syncSources(options: SyncOptions = {}) {
  return runSourceSync(options);
}
