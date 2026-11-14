import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "atlas_editor";
const SESSION_SECONDS = 60 * 60 * 12;
const MIN_SECRET_LENGTH = 32;
const globalAuth = globalThis as unknown as { atlasLoginAttempts?: number[] };

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

export function createSession(
  secret = process.env.SESSION_SECRET ?? "",
  now = Date.now(),
) {
  if (secret.length < MIN_SECRET_LENGTH)
    throw new Error("SESSION_SECRET 至少需要 32 个字符");
  const payload = `${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(24).toString("hex")}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

export function verifySession(
  token: string | undefined,
  secret = process.env.SESSION_SECRET ?? "",
  now = Date.now(),
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
  const expiry = Number(parts[0]);
  const current = Math.floor(now / 1000);
  if (expiry <= current || expiry > current + SESSION_SECONDS) return false;
  return equal(
    parts[2],
    createHmac("sha256", secret)
      .update(`${parts[0]}.${parts[1]}`)
      .digest("hex"),
  );
}

export function takeLoginAttempt(now = Date.now()) {
  const recent = (globalAuth.atlasLoginAttempts ?? []).filter(
    (t) => t > now - 10 * 60 * 1000,
  );
  globalAuth.atlasLoginAttempts = recent;
  if (recent.length >= 10) return false;
  recent.push(now);
  return true;
}

export async function isAuthenticated() {
  return (
    authConfigured() && verifySession((await cookies()).get(COOKIE_NAME)?.value)
  );
}

export async function requireAuth() {
  if (!(await isAuthenticated())) redirect("/admin/login");
}

export async function startSession() {
  (await cookies()).set(COOKIE_NAME, createSession(), {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_SECONDS,
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_INSECURE_ADMIN_COOKIE !== "true",
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE_NAME);
}
