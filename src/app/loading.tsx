export default function Loading() {
  return (
    <main className="page-shell" aria-busy="true" aria-label="正在加载">
      <div className="skeleton" style={{ height: 180 }} />
      <div className="atlas-grid">
        {[1, 2, 3].map((x) => (
          <div className="skeleton" key={x} style={{ height: 240 }} />
        ))}
      </div>
    </main>
  );
}
