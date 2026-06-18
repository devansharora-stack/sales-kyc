"use client";

export default function NumberedList({
  text,
  preambleLabel,
}: {
  text: string;
  preambleLabel?: string;
}) {
  const parts = text.split(/\(\d+\)\s*/);
  const hasNumbered = parts.length > 1;

  if (!hasNumbered) {
    return <p className="text-xs text-slate-600 leading-relaxed">{text}</p>;
  }

  const preamble = parts[0].trim();
  const items = parts.slice(1).map(p => p.replace(/\.\s*$/, "").trim());

  return (
    <div>
      {preamble && (
        <p className="text-xs text-slate-600 leading-relaxed mb-2">
          {preambleLabel && (
            <span className="font-semibold text-slate-700">{preambleLabel}: </span>
          )}
          {preamble}
        </p>
      )}
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
              {i + 1}
            </span>
            <p className="text-xs text-slate-700 leading-relaxed">{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
