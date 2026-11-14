"use client";
import { useFormStatus } from "react-dom";
export function LoginSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="button"
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {pending ? "正在验证…" : "进入工作台"}
    </button>
  );
}
