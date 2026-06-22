// Instant route-level skeleton shown during navigation (Next.js loading.tsx),
// before the client page bundle mounts and starts its own fetch. Keeps the app
// feeling responsive while data round-trips to the (region-distant) database.
export default function RouteLoading() {
  return (
    <div className="animate-fade-in space-y-4">
      <div className="h-5 w-40 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
      <div className="card p-6 space-y-3">
        <div className="h-7 w-64 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
        <div className="h-4 w-80 bg-slate-50 dark:bg-slate-800/60 rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-slate-50 dark:bg-slate-800/60 rounded animate-pulse" />
          ))}
        </div>
      </div>
      <div className="card p-6 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-4 bg-slate-50 dark:bg-slate-800/60 rounded animate-pulse" style={{ width: `${90 - i * 14}%` }} />
        ))}
      </div>
    </div>
  );
}
