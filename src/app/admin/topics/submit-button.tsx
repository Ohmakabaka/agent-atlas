"use client";
import { useFormStatus } from "react-dom";
export function TopicSubmit({
  children,
  secondary = false,
}: {
  children: React.ReactNode;
  secondary?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`button${secondary ? " secondary" : ""}`}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? "正在保存…" : children}
    </button>
  );
}
