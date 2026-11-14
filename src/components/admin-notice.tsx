export function AdminNotice({
  notice,
  error,
}: {
  notice?: string;
  error?: string;
}) {
  return notice || error ? (
    <p
      className="notice"
      role={error ? "alert" : "status"}
      style={{
        padding: 16,
        border: "1px solid var(--border, #d7dedb)",
        borderRadius: 10,
        marginBottom: 20,
      }}
    >
      {error || notice}
    </p>
  ) : null;
}
