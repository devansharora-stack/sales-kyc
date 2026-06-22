"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type ActivityItem = {
  type: "company" | "stakeholder";
  id: string;
  status: string;
  projectId: string | null;
  // present for company items
  companyName?: string;
  // present for stakeholder items
  name?: string;
};

type Toast = { id: string; message: string };

type ActivityContextValue = {
  active: ActivityItem[];
  count: number;
};

const ActivityContext = createContext<ActivityContextValue>({
  active: [],
  count: 0,
});

export function useActivity() {
  return useContext(ActivityContext);
}

const POLL_ACTIVE_MS = 5000; // poll fast while work is in flight
const POLL_IDLE_MS = 30000; // back off when idle

function labelFor(item: ActivityItem): string {
  return item.type === "company" ? item.companyName ?? "Company" : item.name ?? "Stakeholder";
}

function doneMessageFor(item: ActivityItem): string {
  return item.type === "company"
    ? `✓ ${labelFor(item)} research complete`
    : `✓ ${labelFor(item)} analyzed`;
}

export default function ActivityProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ActivityItem[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // ids that were active on the previous poll (to detect active -> done)
  const prevActiveIdsRef = useRef<Set<string>>(new Set());
  // ids we've already toasted, so a lingering recentlyDone item doesn't re-fire
  const toastedRef = useRef<Set<string>>(new Set());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const pushToast = useCallback((message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const poll = useCallback(async () => {
    let nextDelay = POLL_IDLE_MS;
    try {
      const res = await fetch("/api/activity", { cache: "no-store" });
      if (res.ok) {
        const data: { active?: ActivityItem[]; recentlyDone?: ActivityItem[] } = await res.json();
        const nextActive = data.active ?? [];
        const recentlyDone = data.recentlyDone ?? [];

        const prevIds = prevActiveIdsRef.current;
        const nextIds = new Set(nextActive.map((i) => i.id));

        // Fire toasts for items that were active last poll and now appear in recentlyDone.
        for (const done of recentlyDone) {
          const wasActive = prevIds.has(done.id);
          const stillActive = nextIds.has(done.id);
          if (wasActive && !stillActive && !toastedRef.current.has(done.id)) {
            toastedRef.current.add(done.id);
            pushToast(doneMessageFor(done));
          }
        }

        if (mountedRef.current) setActive(nextActive);
        prevActiveIdsRef.current = nextIds;

        // Drop bookkeeping for ids no longer relevant to keep the set small.
        const relevant = new Set<string>([...nextIds, ...recentlyDone.map((i) => i.id)]);
        toastedRef.current = new Set([...toastedRef.current].filter((id) => relevant.has(id)));

        nextDelay = nextActive.length > 0 ? POLL_ACTIVE_MS : POLL_IDLE_MS;
      }
    } catch {
      // network/auth hiccup — back off to idle cadence and retry
      nextDelay = POLL_IDLE_MS;
    } finally {
      if (mountedRef.current) {
        timeoutRef.current = setTimeout(poll, nextDelay);
      }
    }
  }, [pushToast]);

  useEffect(() => {
    mountedRef.current = true;
    poll();
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [poll]);

  return (
    <ActivityContext.Provider value={{ active, count: active.length }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-3 bg-white border border-[#E2E8F0] shadow-lg rounded-xl px-4 py-3 min-w-[260px] max-w-[340px] animate-in"
            style={{ animation: "kg-toast-in 200ms ease-out" }}
          >
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[rgba(50,137,255,0.08)] flex items-center justify-center text-[#3289FF] text-sm font-semibold">
              {"✓"}
            </span>
            <span className="text-xs font-medium text-slate-600 leading-snug flex-1">
              {t.message.replace(/^✓\s*/, "")}
            </span>
            <button
              onClick={() => dismissToast(t.id)}
              className="flex-shrink-0 text-slate-300 hover:text-slate-500 transition-colors cursor-pointer"
              aria-label="Dismiss"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <style>{`@keyframes kg-toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </ActivityContext.Provider>
  );
}
