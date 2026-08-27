import type { Theme } from "../theme";

// Automation-maturity band: label, band name, 5-segment meter, optional
// benchmark line. Data-room: tinted rounded panel. Ledger: plain block.
export default function MaturityCard({
  theme,
  mat,
  benchmarkLine,
}: {
  theme: Theme;
  mat: { band: string; segs: number } | null;
  benchmarkLine?: string | null;
}) {
  const meter = (
    <div className="flex gap-1 mt-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="h-2 flex-1 rounded-full"
          style={{ background: mat && i < mat.segs ? theme.cobalt : theme.hair }}
        />
      ))}
    </div>
  );

  const body = (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: theme.mute }}>
        Automation maturity
      </p>
      {mat ? (
        <>
          <p className="text-[20px] font-extrabold leading-none mt-1.5" style={{ color: theme.ink }}>
            {mat.band}
          </p>
          {meter}
        </>
      ) : (
        <p className="text-[13px] mt-2" style={{ color: theme.mute }}>Assessment in progress</p>
      )}
      {benchmarkLine && (
        <p className="text-[10.5px] mt-2 leading-snug" style={{ color: theme.mute }}>{benchmarkLine}</p>
      )}
    </>
  );

  if (theme.variant === "ledger") return <div>{body}</div>;
  return (
    <div className="rounded-xl p-2 border" style={{ borderColor: theme.hair, background: "#F8FAFC" }}>
      {body}
    </div>
  );
}
