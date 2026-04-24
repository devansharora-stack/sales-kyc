const colors: Record<string, string> = {
  "Critical": "bg-red-200 text-red-900",
  "Immediate": "bg-red-200 text-red-900",
  "Very High": "bg-red-100 text-red-800",
  "High": "bg-orange-100 text-orange-800",
  "Medium-High": "bg-amber-100 text-amber-800",
  "Medium": "bg-yellow-100 text-yellow-800",
  "Low": "bg-slate-100 text-slate-600",
};

export default function UrgencyBadge({ urgency }: { urgency: string }) {
  return (
    <span className={`badge ${colors[urgency] || colors.Medium}`}>
      {urgency}
    </span>
  );
}
