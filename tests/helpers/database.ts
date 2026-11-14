import { createClient } from "@libsql/client";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
/** Apply every committed migration to a new isolated SQLite database. */
export async function initializeDatabase(url: string) {
  const client = createClient({ url });
  try {
    const root = join(process.cwd(), "prisma/migrations");
    for (const entry of (await readdir(root, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      await client.executeMultiple(
        await readFile(join(root, entry.name, "migration.sql"), "utf8"),
      );
    }
  } finally {
    client.close();
  }
}
