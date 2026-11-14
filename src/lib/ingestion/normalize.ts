import { createHash } from "node:crypto";
import { validatePublicUrl } from "./network";

const TRACKING = /^(utm_.+|fbclid|gclid|mc_cid|mc_eid|ref_src|ref_url)$/i;
export function canonicalizeUrl(input: string): string {
  const url = validatePublicUrl(input);
  url.hash = "";
  for (const key of Array.from(url.searchParams.keys()))
    if (TRACKING.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href;
}
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, "");
}
export function articleSlug(title: string, url: string): string {
  const stem =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 55) || "article";
  return `${stem}-${createHash("sha256").update(url).digest("hex").slice(0, 12)}`;
}
export function validDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
