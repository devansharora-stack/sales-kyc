import type { Rating } from "@/lib/types";
import { RATING_LABELS } from "@/lib/types";

const colors: Record<Rating, string> = {
  A: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  B: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  C: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  D: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  E: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  F: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export default function RatingBadge({ rating, showLabel = false, size = "sm" }: {
  rating: Rating;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass = size === "lg" ? "!text-sm !px-3 !py-1" : size === "md" ? "!text-xs !px-2.5 !py-0.5" : "";
  return (
    <span className={`badge ${colors[rating]} ${sizeClass}`}>
      {rating}
      {showLabel && <span className="ml-1 font-medium">{RATING_LABELS[rating]}</span>}
    </span>
  );
}
