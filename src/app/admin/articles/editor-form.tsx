"use client";
import { createContext, useContext, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { saveArticleWithFeedback } from "../actions";
const EditorPending = createContext(false);
export function EditorForm({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <EditorPending.Provider value={pending}>
      <form
        className="panel"
        style={{ padding: 28, display: "grid", gap: 24 }}
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          const form = new FormData(event.currentTarget);
          setError("");
          startTransition(async () => {
            try {
              const result = await saveArticleWithFeedback(form);
              if (result.error) setError(result.error);
              else {
                router.push(result.location!);
                router.refresh();
              }
            } catch {
              setError("保存暂时失败。你的输入已保留，请稍后重试。");
            }
          });
        }}
      >
        {error && (
          <div role="alert" className="notice" style={{ color: "#b84c40" }}>
            {error}
          </div>
        )}
        {children}
      </form>
    </EditorPending.Provider>
  );
}
export function SubmitButton({
  children,
  pendingText = "正在保存…",
  secondary = false,
}: {
  children: React.ReactNode;
  pendingText?: string;
  secondary?: boolean;
}) {
  const { pending: formPending } = useFormStatus();
  const editorPending = useContext(EditorPending);
  const pending = formPending || editorPending;
  return (
    <button
      className={`button ${secondary ? "secondary" : ""}`}
      type="submit"
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? pendingText : children}
    </button>
  );
}
