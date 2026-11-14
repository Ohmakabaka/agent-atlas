import { defineConfig } from "prisma/config";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { loadEnvFile } from "node:process";
import { resolve } from "node:path";

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const configured = process.env.DATABASE_URL || "file:./dev.db";
const url = configured.startsWith("file:")
  ? `file:${resolve("prisma", configured.slice(5))}`
  : configured;
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  experimental: { adapter: true },
  engine: "js",
  adapter: async () => new PrismaLibSQL({ url }),
});
