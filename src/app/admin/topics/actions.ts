"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { deleteTopicRecord, saveTopicRecord } from "@/lib/editor/topics";
const text = (form: FormData, key: string) =>
  String(form.get(key) || "").trim();
const lines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
function errorMessage(error: unknown) {
  if (error instanceof z.ZodError)
    return error.issues.map((issue) => issue.message).join("；");
  if (
    error instanceof Error &&
    !/prisma|SQLITE|invocation|constraint/i.test(error.message)
  )
    return error.message.slice(0, 350);
  return "保存失败。请检查主题标识是否重复，以及引用的资料或父主题是否存在。";
}
function finish(message: string, error: boolean, id?: string): never {
  revalidatePath("/", "layout");
  const params = new URLSearchParams({ [error ? "error" : "notice"]: message });
  if (id) params.set("edit", id);
  redirect(`/admin/topics?${params}`);
}
export async function saveTopic(form: FormData) {
  await requireAuth();
  let error = "",
    id = text(form, "id");
  try {
    const saved = await saveTopicRecord({
      id: id || undefined,
      slug: text(form, "slug"),
      name: text(form, "name"),
      englishName: text(form, "englishName"),
      description: text(form, "description"),
      question: text(form, "question"),
      concepts: lines(text(form, "concepts")),
      readingPath: lines(text(form, "readingPath")),
      featured: form.get("featured") === "on",
      sortOrder: Number(text(form, "sortOrder")),
      parentId: text(form, "parentId") || null,
    });
    id = saved.id;
  } catch (caught) {
    error = errorMessage(caught);
  }
  finish(error || "主题已保存，公开主题页与技术地图已更新。", !!error, id);
}
export async function deleteTopic(form: FormData) {
  await requireAuth();
  let error = "";
  try {
    await deleteTopicRecord(text(form, "id"), text(form, "confirmation"));
  } catch (caught) {
    error = errorMessage(caught);
  }
  finish(
    error || "空主题已删除，操作已记录到审计日志。",
    !!error,
    error ? text(form, "id") : undefined,
  );
}
