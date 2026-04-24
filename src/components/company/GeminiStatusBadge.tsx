const config: Record<string, { label: string; className: string }> = {
  land: { label: "Land", className: "bg-green-100 text-green-800" },
  expand: { label: "Expand", className: "bg-purple-100 text-purple-800" },
  explore: { label: "Explore", className: "bg-blue-100 text-blue-800" },
  none: { label: "None", className: "bg-slate-100 text-slate-500" },
};

const fallback = { label: "Unknown", className: "bg-slate-100 text-slate-500" };

export default function GeminiStatusBadge({ status }: { status: string }) {
  const c = config[status] || fallback;
  return (
    <span className={`badge ${c.className}`}>
      {status !== "none" && <span className="mr-1">G</span>}
      {c.label}
    </span>
  );
}
