"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const INTER = "'Inter', system-ui, sans-serif";

/* ----------------------------- background graph ----------------------------- */
// Purely decorative texture behind the panel. No labels, no giant hub — just a
// faint drifting mesh so the space reads as "network intelligence".
type Node = { id: string; x: number; y: number; kind: "hub" | "sig" | "dot" };
const NODES: Node[] = [
  { id: "hub", x: 620, y: 300, kind: "hub" },
  { id: "a", x: 210, y: 150, kind: "sig" }, { id: "b", x: 900, y: 120, kind: "sig" },
  { id: "c", x: 1040, y: 330, kind: "sig" }, { id: "d", x: 940, y: 600, kind: "sig" },
  { id: "e", x: 560, y: 660, kind: "sig" }, { id: "f", x: 180, y: 560, kind: "sig" },
  { id: "n1", x: 380, y: 300, kind: "dot" }, { id: "n2", x: 760, y: 320, kind: "dot" },
  { id: "n3", x: 830, y: 470, kind: "dot" }, { id: "n4", x: 400, y: 480, kind: "dot" },
  { id: "n5", x: 1080, y: 180, kind: "dot" }, { id: "n6", x: 1100, y: 520, kind: "dot" },
  { id: "n7", x: 720, y: 110, kind: "dot" }, { id: "n8", x: 130, y: 370, kind: "dot" },
];
const NMAP = Object.fromEntries(NODES.map((n) => [n.id, n]));
const EDGES: [string, string][] = [
  ["hub", "a"], ["hub", "b"], ["hub", "c"], ["hub", "d"], ["hub", "e"], ["hub", "f"],
  ["hub", "n1"], ["hub", "n2"], ["hub", "n3"], ["hub", "n4"],
  ["a", "n1"], ["n1", "n8"], ["b", "n7"], ["b", "n2"], ["c", "n5"], ["c", "n3"],
  ["d", "n6"], ["d", "n3"], ["e", "n3"], ["e", "n4"], ["f", "n4"], ["f", "n8"], ["n2", "n7"],
];

function GraphBg() {
  return (
    <svg
      className="g-drift pointer-events-none absolute inset-0 h-full w-full opacity-[0.4]"
      viewBox="0 0 1200 750"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {EDGES.map(([a, b], i) => {
        const p = NMAP[a];
        const q = NMAP[b];
        return (
          <line
            key={`${a}-${b}`}
            className="g-edge"
            x1={p.x}
            y1={p.y}
            x2={q.x}
            y2={q.y}
            stroke="#3289FF"
            strokeOpacity={0.22}
            strokeWidth={1.2}
            pathLength={1}
            style={{ animationDelay: `${0.2 + i * 0.05}s` }}
          />
        );
      })}
      {NODES.map((n, i) => (
        <circle
          key={n.id}
          className="g-node"
          cx={n.x}
          cy={n.y}
          r={n.kind === "hub" ? 9 : n.kind === "sig" ? 6 : 3.5}
          fill={n.kind === "dot" ? "#4b6ea8" : "#3289FF"}
          fillOpacity={n.kind === "dot" ? 0.6 : 0.9}
          style={{ animationDelay: `${0.4 + i * 0.06}s` }}
        />
      ))}
    </svg>
  );
}

/* ------------------------------- phase list -------------------------------- */
const PHASES = [
  { label: "Financials & filings", meta: "SEC · 10-K" },
  { label: "Stakeholders mapped", meta: "12 people" },
  { label: "Tech stack fingerprinted", meta: "40+ vendors" },
  { label: "News & signals scanned", meta: "90 days" },
  { label: "Competitors & GTM fit", meta: "peer set" },
];
type PState = "pending" | "running" | "done";

function PhaseList() {
  const [states, setStates] = useState<PState[]>(() => PHASES.map(() => "pending"));

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const timers: ReturnType<typeof setTimeout>[] = [];
    if (reduce) {
      timers.push(setTimeout(() => setStates(PHASES.map(() => "done")), 0));
      return () => timers.forEach(clearTimeout);
    }

    let cancelled = false;
    const run = (base: number) => {
      let t = base;
      // reset
      timers.push(setTimeout(() => setStates(PHASES.map(() => "pending")), t));
      t += 500;
      PHASES.forEach((_, idx) => {
        timers.push(
          setTimeout(() => setStates((s) => s.map((v, i) => (i === idx ? "running" : v))), t)
        );
        t += 650;
        timers.push(
          setTimeout(() => setStates((s) => s.map((v, i) => (i === idx ? "done" : v))), t)
        );
        t += 260;
      });
      // hold on "all done", then loop
      timers.push(
        setTimeout(() => {
          if (!cancelled) run(0);
        }, t + 2600)
      );
    };
    run(400);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  const doneCount = states.filter((s) => s === "done").length;

  return (
    <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-[11px] font-medium text-white/60">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-green-400" />
          Researching Con Edison
        </span>
        <span className="font-mono text-[11px] text-white/40">
          {doneCount}/{PHASES.length}
        </span>
      </div>

      <div className="space-y-2">
        {PHASES.map((p, i) => {
          const st = states[i];
          return (
            <div
              key={p.label}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-300 ${
                st === "done"
                  ? "border-green-400/20 bg-green-400/[0.06]"
                  : st === "running"
                  ? "border-[#3289FF]/40 bg-[#3289FF]/[0.08]"
                  : "border-white/5 bg-white/[0.02]"
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                {st === "done" ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-400/20 text-[13px] text-green-400">
                    ✓
                  </span>
                ) : st === "running" ? (
                  <span className="inline-block animate-spin text-[15px] text-[#7db1ff]">◠</span>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-white/20" />
                )}
              </span>
              <span
                className={`text-[13px] transition-colors duration-300 ${
                  st === "pending" ? "text-white/40" : "text-white/90"
                }`}
              >
                {p.label}
              </span>
              {st === "done" && (
                <span className="ml-auto font-mono text-[11px] text-white/35">{p.meta}</span>
              )}
            </div>
          );
        })}
      </div>

      {doneCount === PHASES.length && (
        <p className="mt-4 flex items-center gap-2 text-[12px] font-medium text-green-400 animate-fade-in">
          ✓ Profile ready · GTM brief compiled
        </p>
      )}
    </div>
  );
}

/* --------------------------------- page ------------------------------------ */
function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div className="grid min-h-screen w-full bg-white dark:bg-[#0b1120] lg:grid-cols-[1.1fr_1fr]">
      {/* ---------------- LEFT — research surface (always dark) ---------------- */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#070d1f] p-12 text-white lg:flex">
        <GraphBg />
        {/* vignette keeps the left text/content zone clean over the graph */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(105deg, rgba(7,13,31,0.94) 0%, rgba(7,13,31,0.7) 45%, rgba(7,13,31,0.3) 100%)",
          }}
        />

        {/* brand */}
        <div className="relative flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3289FF] text-sm font-bold shadow-lg shadow-blue-900/40"
            style={{ fontFamily: INTER }}
          >
            KG
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold tracking-tight">
              KYC <span className="font-normal text-white/50">Genie</span>
            </p>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#7db1ff]">
              AI research intelligence
            </p>
          </div>
        </div>

        {/* headline + live phases */}
        <div className="relative max-w-lg">
          <h1 className="text-[3rem] font-semibold leading-[1.03] tracking-tight text-white">
            Know every account
            <br />
            before the <span className="text-[#7db1ff]">call</span>.
          </h1>
          <p className="mt-4 mb-7 max-w-md leading-relaxed text-white/55">
            One multi-agent sweep — financials, stakeholders, tech stack, news
            and competitors — into a GTM-ready profile in minutes.
          </p>
          <PhaseList />
        </div>

        {/* stats footer */}
        <div className="relative flex gap-10 border-t border-white/10 pt-6">
          <div>
            <p className="text-2xl font-bold tabular-nums">40+</p>
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/40">Sources per run</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">6</p>
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/40">Research agents</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">&lt;5m</p>
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/40">To a full profile</p>
          </div>
        </div>
      </div>

      {/* ---------------- RIGHT — sign in (adapts to theme) ---------------- */}
      <div className="relative flex items-center justify-center px-6 py-16 sm:px-16">
        <span className="absolute right-8 top-8 hidden text-[11px] font-medium uppercase tracking-[0.2em] text-slate-300 dark:text-slate-600 lg:block">
          Techolution
        </span>

        <div className="w-full max-w-sm animate-fade-in">
          {/* mobile brand */}
          <div className="mb-10 flex items-center gap-2 lg:hidden">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3289FF] text-xs font-bold text-white"
              style={{ fontFamily: INTER }}
            >
              KG
            </span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">KYC Genie</span>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3289FF]">
            Welcome back
          </p>
          <h2 className="mt-3 text-[2.5rem] font-semibold leading-[1.05] tracking-tight text-slate-900 dark:text-slate-100">
            Sign in to
            <br />
            KYC Genie
          </h2>
          <p className="mt-3 text-slate-500 dark:text-slate-400">
            Continue to your research workspace.
          </p>

          {error && (
            <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/30 dark:bg-red-900/30">
              <p className="text-xs text-red-700 dark:text-red-300">
                {error === "AccessDenied"
                  ? "Access denied. Your email is not authorized."
                  : "An error occurred during sign in. Please try again."}
              </p>
            </div>
          )}

          <button
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="mt-8 flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl bg-[#3289FF] px-6 py-3.5 font-medium text-white transition-colors hover:bg-[#2570e0]"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white">
              <svg viewBox="0 0 48 48" className="h-4 w-4">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
            </span>
            Continue with Google
          </button>

          <div className="mt-8 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">40+</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Sources per run</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">&lt;5m</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">To a full profile</p>
            </div>
          </div>

          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-900/40">
            <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
            </svg>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Restricted to <span className="font-medium text-slate-700 dark:text-slate-200">@techolution.com</span> accounts · Encrypted &amp; SSO-gated.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white dark:bg-[#0b1120]">
          <div className="text-slate-400 dark:text-slate-500">Loading...</div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
