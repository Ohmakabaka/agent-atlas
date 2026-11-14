import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { isIP } from "node:net";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";

const COOKIE_NAME = "atlas_editor";
const CLIENT_COOKIE_NAME = "atlas_login_client";
const SESSION_SECONDS = 60 * 60 * 12;
const CLIENT_SECONDS = 60 * 60 * 24 * 30;
const MIN_SECRET_LENGTH = 32;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const CLIENT_ATTEMPTS = 10;
const GLOBAL_ATTEMPTS = 300;

export function authConfigured() {
  return (
    (process.env.ADMIN_PASSWORD?.length ?? 0) >= 12 &&
    (process.env.SESSION_SECRET?.length ?? 0) >= MIN_SECRET_LENGTH
  );
}
function equal(a: string, b: string) {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
export function checkPassword(
  password: string,
  expected = process.env.ADMIN_PASSWORD ?? "",
) {
  return (
    expected.length >= 12 && password.length <= 512 && equal(password, expected)
  );
}
function sessionSecret() {
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) return "";
  // Changing either server secret or editor password revokes outstanding sessions.
  return createHmac("sha256", secret)
    .update(`editor-password:${process.env.ADMIN_PASSWORD ?? ""}`)
    .digest("hex");
}
function createToken(domain: string, ttl: number, secret: string, now: number) {
  if (secret.length < MIN_SECRET_LENGTH)
    throw new Error("SESSION_SECRET 至少需要 32 个字符");
  const payload = `${Math.floor(now / 1000) + ttl}.${randomBytes(24).toString("hex")}`;
  return `${payload}.${createHmac("sha256", secret).update(`${domain}:${payload}`).digest("hex")}`;
}
function verifyToken(
  token: string | undefined,
  domain: string,
  ttl: number,
  secret: string,
  now: number,
) {
  if (!token || token.length > 200 || secret.length < MIN_SECRET_LENGTH)
    return false;
  const parts = token.split(".");
  if (
    parts.length !== 3 ||
    !/^\d{10}$/.test(parts[0]) ||
    !/^[a-f0-9]{48}$/.test(parts[1]) ||
    !/^[a-f0-9]{64}$/.test(parts[2])
  )
    return false;
  const expiry = Number(parts[0]),
    current = Math.floor(now / 1000);
  if (expiry <= current || expiry > current + ttl) return false;
  return equal(
    parts[2],
    createHmac("sha256", secret)
      .update(`${domain}:${parts[0]}.${parts[1]}`)
      .digest("hex"),
  );
}
export function createSession(secret = sessionSecret(), now = Date.now()) {
  return createToken("editor", SESSION_SECONDS, secret, now);
}
export function verifySession(
  token: string | undefined,
  secret = sessionSecret(),
  now = Date.now(),
) {
  return verifyToken(token, "editor", SESSION_SECONDS, secret, now);
}
export function createClientToken(
  secret = process.env.SESSION_SECRET ?? "",
  now = Date.now(),
) {
  return createToken("login-client", CLIENT_SECONDS, secret, now);
}
export function verifyClientToken(
  token: string | undefined,
  secret = process.env.SESSION_SECRET ?? "",
  now = Date.now(),
) {
  return verifyToken(token, "login-client", CLIENT_SECONDS, secret, now);
}

/** Trust only a deliberately configured, proxy-overwritten, single IP header. */
export function trustedClientIp(
  requestHeaders: Pick<Headers, "get">,
  trustProxy = process.env.TRUST_PROXY === "true",
  headerName = process.env.TRUSTED_CLIENT_IP_HEADER,
) {
  if (!trustProxy || !headerName || !/^[a-z0-9-]+$/i.test(headerName))
    return undefined;
  const value = requestHeaders.get(headerName)?.trim();
  if (!value || !isIP(value)) return undefined; // Reject forwarded chains and arbitrary text.
  return value.toLowerCase();
}
function clientKey(identity: string) {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "")
    .update(`login-budget:${identity}`)
    .digest("hex");
}
function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    path: "/",
    maxAge,
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_INSECURE_ADMIN_COOKIE !== "true",
  };
}
/** The token is an anonymous rate-limit identity, never an editor credential. */
export async function loginFormToken() {
  const existing = (await cookies()).get(CLIENT_COOKIE_NAME)?.value;
  return verifyClientToken(existing) ? existing! : createClientToken();
}
export async function loginClientKey(formToken: string) {
  const cookieStore = await cookies();
  const existing = cookieStore.get(CLIENT_COOKIE_NAME)?.value;
  const token = verifyClientToken(existing)
    ? existing!
    : verifyClientToken(formToken)
      ? formToken
      : createClientToken();
  cookieStore.set(CLIENT_COOKIE_NAME, token, cookieOptions(CLIENT_SECONDS));
  const ip = trustedClientIp(await headers());
  return clientKey(ip ? `ip:${ip}` : `cookie:${token.split(".")[1]}`);
}
export interface LoginBudget {
  allowed: boolean;
  retryAfterSeconds: number;
  blockedBy?: "client" | "global";
  logBlocked?: boolean;
}
/** Atomic counters persist across server restarts and concurrent workers. */
export async function takeLoginAttempt(
  identity: string,
  now = Date.now(),
): Promise<LoginBudget> {
  if (!/^[a-zA-Z0-9:_-]{1,128}$/.test(identity))
    throw new Error("Invalid login identity");
  const bucket = Math.floor(now / LOGIN_WINDOW_MS);
  const windowStart = new Date(bucket * LOGIN_WINDOW_MS);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(((bucket + 1) * LOGIN_WINDOW_MS - now) / 1000),
  );
  return prisma.$transaction(async (tx) => {
    const global = await tx.rateLimit.upsert({
      where: { key: `login:global:${bucket}` },
      create: { key: `login:global:${bucket}`, count: 1, windowStart },
      update: { count: { increment: 1 } },
    });
    if (global.count > GLOBAL_ATTEMPTS)
      return {
        allowed: false,
        retryAfterSeconds,
        blockedBy: "global" as const,
        logBlocked: global.count === GLOBAL_ATTEMPTS + 1,
      };
    const client = await tx.rateLimit.upsert({
      where: { key: `login:client:${identity}:${bucket}` },
      create: {
        key: `login:client:${identity}:${bucket}`,
        count: 1,
        windowStart,
      },
      update: { count: { increment: 1 } },
    });
    // Retain one day of bounded counters, without storing raw IPs or cookie values.
    if (global.count === 1)
      await tx.rateLimit.deleteMany({
        where: { windowStart: { lt: new Date(now - 86_400_000) } },
      });
    return {
      allowed: client.count <= CLIENT_ATTEMPTS,
      retryAfterSeconds,
      ...(client.count > CLIENT_ATTEMPTS
        ? {
            blockedBy: "client" as const,
            logBlocked: client.count === CLIENT_ATTEMPTS + 1,
          }
        : {}),
    };
  });
}
export async function recordAuthentication(
  action: "login_success" | "login_failed" | "login_rate_limited" | "logout",
  detail: { scope?: string } = {},
) {
  await prisma.auditLog.create({
    data: { action, entityType: "authentication", entityId: "editor", detail },
  });
}
export async function isAuthenticated() {
  // Always read request cookies before checking runtime credentials. A build
  // without secrets must not prerender an admin page's unauthenticated redirect.
  const cookieStore = await cookies();
  return authConfigured() && verifySession(cookieStore.get(COOKIE_NAME)?.value);
}
export async function requireAuth() {
  if (!(await isAuthenticated())) redirect("/admin/login");
}
export async function startSession() {
  (await cookies()).set(
    COOKIE_NAME,
    createSession(),
    cookieOptions(SESSION_SECONDS),
  );
}
export async function endSession() {
  (await cookies()).delete(COOKIE_NAME);
}
