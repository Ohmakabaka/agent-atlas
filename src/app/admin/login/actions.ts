"use server";
import { redirect } from "next/navigation";
import {
  authConfigured,
  checkPassword,
  endSession,
  startSession,
  takeLoginAttempt,
} from "@/lib/auth";
export async function login(form: FormData) {
  if (!authConfigured()) redirect("/admin/login?error=config");
  if (!takeLoginAttempt()) redirect("/admin/login?error=rate");
  const password = String(form.get("password") ?? "");
  if (!checkPassword(password)) redirect("/admin/login?error=invalid");
  await startSession();
  redirect("/admin");
}
export async function logout() {
  await endSession();
  redirect("/admin/login");
}
