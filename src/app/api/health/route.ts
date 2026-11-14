import { NextResponse } from "next/server";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const expected = (
      await readdir(join(process.cwd(), "prisma/migrations"), {
        withFileTypes: true,
      })
    )
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const rows = await prisma.$queryRaw<
      {
        migration_name: string;
        finished_at: unknown;
        rolled_back_at: unknown;
      }[]
    >`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
    const active = rows.filter((row) => row.rolled_back_at === null);
    if (
      active.some((row) => !row.finished_at) ||
      JSON.stringify(active.map((row) => row.migration_name)) !==
        JSON.stringify(expected)
    )
      throw new Error("schema");
    const tables = await prisma.$queryRaw<
      { name: string }[]
    >`SELECT name FROM sqlite_master WHERE type = 'table'`;
    const actual = new Set(tables.map((row) => row.name));
    if (
      [
        "Article",
        "Topic",
        "Source",
        "Relation",
        "RateLimit",
        "ArticleRevision",
        "AuditLog",
        "SyncLease",
      ].some((name) => !actual.has(name))
    )
      throw new Error("tables");
    const columns = await prisma.$queryRaw<
      { name: string }[]
    >`PRAGMA table_info("Article")`;
    if (!columns.some((column) => column.name === "version"))
      throw new Error("columns");
    return NextResponse.json(
      { status: "ok", database: "ready", schema: "current" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
