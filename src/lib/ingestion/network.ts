import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 12_000;

/** Reject local, metadata-service, multicast and reserved address ranges. */
export function isPublicAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(ip) === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(ip) === 6) {
    // Only global unicast; disallow transition mechanisms and documentation ranges.
    const [first, second] = ip
      .split(":")
      .map((value) => Number.parseInt(value || "0", 16));
    return (
      first >= 0x2000 &&
      first <= 0x3fff &&
      first !== 0x2002 &&
      !(first === 0x2001 && (second < 0x200 || second === 0xdb8))
    );
  }
  return false;
}

export function validatePublicUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("请输入完整的 http(s) URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("仅接受不含凭据的 http(s) URL");
  }
  if (url.port && !["80", "443"].includes(url.port))
    throw new Error("仅支持标准 HTTP/HTTPS 端口");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    (!hostname.includes(".") && !isIP(hostname))
  ) {
    throw new Error("不允许访问本地或内部网络地址");
  }
  if (isIP(hostname) && !isPublicAddress(hostname))
    throw new Error("不允许访问私有或保留 IP 地址");
  return url;
}

async function lookupWithDeadline(hostname: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      lookup(hostname, { all: true }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("DNS 解析超时")), 5_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function resolvePublicUrl(
  input: string,
): Promise<{ url: URL; address: string; family: number }> {
  const url = validatePublicUrl(input);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const entries = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookupWithDeadline(hostname);
  if (
    !entries.length ||
    entries.some(({ address }) => !isPublicAddress(address))
  ) {
    throw new Error("来源域名解析到私有或保留网络，已拒绝访问");
  }
  return { url, ...entries[0] };
}

export interface SafeResponse {
  text: string;
  url: string;
  contentType: string;
}

/** Uses a pinned verified DNS result; redirects are validated again, not auto-followed. */
export interface RequestOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
}
export async function safeFetch(
  input: string,
  redirects = 0,
  options: RequestOptions = {},
): Promise<SafeResponse> {
  if (redirects > 3) throw new Error("来源重定向次数过多");
  const { url, address, family } = await resolvePublicUrl(input);
  const response = await new Promise<{
    status: number;
    location?: string;
    contentType: string;
    text: string;
  }>((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      url,
      {
        method: options.method || "GET",
        headers: {
          "User-Agent": "AgentAtlas/0.1 (+metadata-only)",
          Accept:
            "text/html,application/rss+xml,application/atom+xml,application/json,text/xml;q=0.9",
          ...options.headers,
        },
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [{ address, family }]);
          else callback(null, address, family);
        },
      },
      (res) => {
        const status = res.statusCode ?? 500;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.destroy();
          resolve({
            status,
            location: res.headers.location,
            contentType: "",
            text: "",
          });
          return;
        }
        if (status < 200 || status >= 300) {
          res.destroy();
          reject(new Error(`来源返回 HTTP ${status}`));
          return;
        }
        const length = Number(res.headers["content-length"] ?? 0);
        if (length > MAX_BYTES) {
          res.destroy();
          reject(new Error("来源响应超过 2 MB 限制"));
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > MAX_BYTES) {
            res.destroy();
            reject(new Error("来源响应超过 2 MB 限制"));
          } else chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            status,
            text: Buffer.concat(chunks).toString("utf8"),
            contentType: String(res.headers["content-type"] ?? ""),
          }),
        );
      },
    );
    const timer = setTimeout(
      () => request.destroy(new Error("来源请求超时")),
      TIMEOUT_MS,
    );
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
    request.end(options.body);
  });
  if (response.location) {
    if (options.method === "POST" || options.headers?.Authorization)
      throw new Error("模型 API 不允许重定向");
    return safeFetch(
      new URL(response.location, url).href,
      redirects + 1,
      options,
    );
  }
  return {
    text: response.text,
    url: url.href,
    contentType: response.contentType,
  };
}
