import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import { readFile } from "node:fs/promises";
import { rootCertificates } from "node:tls";
import { ProxyAgent, request as proxyRequest } from "undici";

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
  url.hostname = url.hostname.replace(/\.$/, "");
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
  status: number;
  etag?: string;
  lastModified?: string;
}

export interface RequestOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  allowNotModified?: boolean;
  signal?: AbortSignal;
}

/** Operator-defined hosts are a trust boundary: the proxy must reject private destinations. */
export function proxyHostAllowed(
  hostname: string,
  configured = process.env.INGESTION_PROXY_HOSTS || "",
) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (isIP(host) || !host.includes(".")) return false;
  return configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(host);
}

export function bypassProxy(
  url: URL,
  configured = process.env.no_proxy || process.env.NO_PROXY || "",
) {
  return configured.split(",").some((entry) => {
    const value = entry.trim().toLowerCase();
    if (!value) return false;
    if (value === "*") return true;
    const [rawHost, port] = value.split(":");
    if (
      port &&
      port !== (url.port || (url.protocol === "https:" ? "443" : "80"))
    )
      return false;
    const host = rawHost.replace(/^\./, "");
    return url.hostname === host || url.hostname.endsWith(`.${host}`);
  });
}

function configuredProxy(url: URL) {
  if (!proxyHostAllowed(url.hostname) || bypassProxy(url)) return null;
  const value =
    url.protocol === "https:"
      ? process.env.https_proxy ||
        process.env.HTTPS_PROXY ||
        process.env.http_proxy ||
        process.env.HTTP_PROXY
      : process.env.http_proxy || process.env.HTTP_PROXY;
  if (!value) return null;
  try {
    const proxy = new URL(value);
    if (!["http:", "https:"].includes(proxy.protocol)) throw new Error();
    return proxy;
  } catch {
    throw new Error("代理配置无效：仅支持 HTTP 或 HTTPS 代理");
  }
}

export class FetchError extends Error {
  constructor(
    message: string,
    public status?: number,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

type ResponseData = Omit<SafeResponse, "url"> & { location?: string };
const responseHeaders = (
  headers: Record<string, string | string[] | undefined>,
) => ({
  contentType: String(headers["content-type"] || ""),
  etag: typeof headers.etag === "string" ? headers.etag : undefined,
  lastModified:
    typeof headers["last-modified"] === "string"
      ? headers["last-modified"]
      : undefined,
});
function statusError(status: number, retryAfter?: string | string[]) {
  const parsed = typeof retryAfter === "string" ? Number(retryAfter) : NaN;
  return new FetchError(
    `来源返回 HTTP ${status}`,
    status,
    Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 3600)) : undefined,
  );
}

async function throughProxy(
  url: URL,
  proxy: URL,
  options: RequestOptions,
  headers: Record<string, string>,
): Promise<ResponseData> {
  // A configured CA is additive to Node's standard trust roots, never a verification bypass.
  const caFile =
    process.env.INGESTION_CA_FILE ||
    process.env.NODE_EXTRA_CA_CERTS ||
    process.env.SSL_CERT_FILE ||
    process.env.REQUESTS_CA_BUNDLE;
  const ca = caFile
    ? [...rootCertificates, await readFile(caFile, "utf8")]
    : undefined;
  const agent = new ProxyAgent({
    uri: proxy.href,
    requestTls: ca ? { ca } : undefined,
    proxyTls: ca ? { ca } : undefined,
  });
  try {
    const response = await proxyRequest(url.href, {
      dispatcher: agent,
      method: options.method || "GET",
      headers,
      body: options.body,
      signal: options.signal
        ? AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), options.signal])
        : AbortSignal.timeout(TIMEOUT_MS),
      headersTimeout: TIMEOUT_MS,
      bodyTimeout: TIMEOUT_MS,
    });
    // Undici emits an AbortError when a deliberately discarded body is destroyed.
    // Keep it handled even before the async iterator starts (304, redirect, rejection).
    response.body.on("error", () => {});
    const status = response.statusCode;
    const metadata = responseHeaders(response.headers);
    if (status >= 300 && status < 400 && response.headers.location) {
      response.body.destroy();
      return {
        status,
        ...metadata,
        location: String(response.headers.location),
        text: "",
      };
    }
    if (status === 304 && options.allowNotModified) {
      response.body.destroy();
      return { status, ...metadata, text: "" };
    }
    if (status < 200 || status >= 300) {
      response.body.destroy();
      throw statusError(status, response.headers["retry-after"]);
    }
    if (Number(response.headers["content-length"] || 0) > MAX_BYTES) {
      response.body.destroy();
      throw new Error("来源响应超过 2 MB 限制");
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BYTES) {
        response.body.destroy();
        throw new Error("来源响应超过 2 MB 限制");
      }
      chunks.push(buffer);
    }
    return {
      status,
      ...metadata,
      text: Buffer.concat(chunks).toString("utf8"),
    };
  } catch (error) {
    if (options.signal?.aborted) throw new Error("采集任务已取消");
    if (
      error instanceof FetchError ||
      (error instanceof Error && error.message === "来源响应超过 2 MB 限制")
    )
      throw error;
    // Do not leak proxy credentials or URLs from low-level errors into job logs.
    throw new FetchError("代理请求失败：请检查出口、CA 信任与目标域名授权");
  } finally {
    await agent.close();
  }
}

async function directRequest(
  input: string,
  options: RequestOptions,
  headers: Record<string, string>,
): Promise<ResponseData> {
  const { url, address, family } = await resolvePublicUrl(input);
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? https : http).request(
      url,
      {
        method: options.method || "GET",
        signal: options.signal,
        headers,
        lookup: (_hostname, opts, callback) => {
          if (opts.all) callback(null, [{ address, family }]);
          else callback(null, address, family);
        },
      },
      (res) => {
        const status = res.statusCode || 500;
        const metadata = responseHeaders(res.headers);
        if (status >= 300 && status < 400 && res.headers.location) {
          res.destroy();
          resolve({
            status,
            ...metadata,
            location: res.headers.location,
            text: "",
          });
          return;
        }
        if (status === 304 && options.allowNotModified) {
          res.destroy();
          resolve({ status, ...metadata, text: "" });
          return;
        }
        if (status < 200 || status >= 300) {
          res.destroy();
          reject(statusError(status, res.headers["retry-after"]));
          return;
        }
        if (Number(res.headers["content-length"] || 0) > MAX_BYTES) {
          res.destroy();
          reject(new Error("来源响应超过 2 MB 限制"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            res.destroy();
            reject(new Error("来源响应超过 2 MB 限制"));
          } else chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("aborted", () => reject(new Error("来源响应意外中断")));
        res.on("end", () =>
          resolve({
            status,
            ...metadata,
            text: Buffer.concat(chunks).toString("utf8"),
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
}

/** Every redirect is checked again; direct requests pin DNS, proxy requests require an explicit host allowlist. */
export async function safeFetch(
  input: string,
  redirects = 0,
  options: RequestOptions = {},
): Promise<SafeResponse> {
  if (redirects > 3) throw new Error("来源重定向次数过多");
  const url = validatePublicUrl(input);
  const proxy = configuredProxy(url);
  const headers = {
    "User-Agent": "AgentAtlas/1.0 (+metadata-only)",
    Accept:
      "text/html,application/rss+xml,application/atom+xml,application/json,text/xml;q=0.9",
    "Accept-Encoding": "identity",
    ...options.headers,
  };
  const response = proxy
    ? await throughProxy(url, proxy, options, headers)
    : await directRequest(url.href, options, headers);
  if (response.location) {
    if (
      options.method === "POST" ||
      Object.keys(options.headers || {}).some(
        (key) => key.toLowerCase() === "authorization",
      )
    )
      throw new Error("带凭证的请求不允许重定向");
    const target = validatePublicUrl(new URL(response.location, url).href);
    if (url.protocol === "https:" && target.protocol !== "https:")
      throw new Error("拒绝从 HTTPS 降级到 HTTP");
    // Conditional validators are only meaningful at the same origin.
    const nextOptions = { ...options, headers: { ...options.headers } };
    if (target.origin !== url.origin) {
      delete nextOptions.headers["If-None-Match"];
      delete nextOptions.headers["If-Modified-Since"];
    }
    return safeFetch(target.href, redirects + 1, nextOptions);
  }
  return { ...response, url: url.href };
}
