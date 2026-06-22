const config: Record<string, { label: string; className: string }> = {
  land: { label: "Land", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  expand: { label: "Expand", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  explore: { label: "Explore", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  none: { label: "None", className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
};

const fallback = { label: "Unknown", className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" };

export default function GeminiStatusBadge({ status }: { status: string }) {
  const c = config[status] || fallback;
  return (
    <span className={`badge ${c.className}`}>
      {status !== "none" && <span className="mr-1">G</span>}
      {c.label}
    </span>
  );
}
