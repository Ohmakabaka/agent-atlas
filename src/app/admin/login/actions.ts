"use server";
import { redirect } from "next/navigation";
import {
  authConfigured,
  checkPassword,
  endSession,
  isAuthenticated,
  loginClientKey,
  recordAuthentication,
  startSession,
  takeLoginAttempt,
} from "@/lib/auth";
export async function login(form: FormData) {
  if (!authConfigured()) redirect("/admin/login?error=config");
  let outcome: "ok" | "rate" | "invalid" | "unavailable" = "unavailable";
  let retryAfter = 0;
  try {
    const client = await loginClientKey(String(form.get("clientToken") ?? ""));
    const budget = await takeLoginAttempt(client);
    if (!budget.allowed) {
      if (budget.logBlocked)
        await recordAuthentication("login_rate_limited", {
          scope: budget.blockedBy,
        });
      retryAfter = budget.retryAfterSeconds;
      outcome = "rate";
    } else if (!checkPassword(String(form.get("password") ?? ""))) {
      await recordAuthentication("login_failed");
      outcome = "invalid";
    } else {
      await recordAuthentication("login_success");
      await startSession();
      outcome = "ok";
    }
  } catch {
    // Database/counter failures fail closed; never print supplied credentials.
    outcome = "unavailable";
  }
  if (outcome === "ok") redirect("/admin");
  redirect(
    `/admin/login?error=${outcome}${outcome === "rate" ? `&retry=${retryAfter}` : ""}`,
  );
}
export async function logout() {
  const authenticated = await isAuthenticated();
  await endSession();
  // Signing out must still clear the browser credential during a database outage.
  if (authenticated) await recordAuthentication("logout").catch(() => undefined);
  redirect("/admin/login");
}
