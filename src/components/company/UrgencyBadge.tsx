const colors: Record<string, string> = {
  "Critical": "bg-red-200 text-red-900 dark:bg-red-900/30 dark:text-red-300",
  "Immediate": "bg-red-200 text-red-900 dark:bg-red-900/30 dark:text-red-300",
  "Very High": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  "High": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  "Medium-High": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  "Medium": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  "Low": "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export default function UrgencyBadge({ urgency }: { urgency: string }) {
  return (
    <span className={`badge ${colors[urgency] || colors.Medium}`}>
      {urgency}
    </span>
  );
}
