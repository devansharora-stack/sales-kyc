"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/db";
import type { ResearchStep } from "@/lib/types";

// --- Phase definitions ---

interface PhaseInfo {
  id: number;
  label: string;
  agents: string[];
}

const PHASES: PhaseInfo[] = [
  { id: 1, label: "Foundation", agents: ["company_profile", "tech_stack", "financial_signal"] },
  { id: 2, label: "Intelligence", agents: ["trigger_scanner", "pain_point_analyzer", "stakeholder_researcher"] },
  { id: 3, label: "Synthesis", agents: ["solution_mapper", "gtm_generator", "scoring_agent"] },
  { id: 4, label: "Verification", agents: ["verification"] },
];

const AGENT_LABELS: Record<string, string> = {
  company_profile: "Company Profile",
  tech_stack: "Tech Stack",
  financial_signal: "Financial Signal",
  trigger_scanner: "Trigger Scanner",
  pain_point_analyzer: "Pain Points",
  stakeholder_researcher: "Stakeholders",
  solution_mapper: "Solution Mapping",
  gtm_generator: "GTM Strategy",
  scoring_agent: "Scoring",
  verification: "Verification",
};

// --- Types ---

interface Job {
  id: string;
  project_id: string;
  company_name: string;
  status: string;
  progress: number;
  research_steps: ResearchStep[];
}

type StepOutput = Record<string, unknown>;

// --- Helper components ---

function PhaseStatus({ steps, phase }: { steps: ResearchStep[]; phase: PhaseInfo }) {
  const phaseSteps = steps.filter((s) => phase.agents.includes(s.agent_name));
  const completed = phaseSteps.filter((s) => s.status === "completed").length;
  const running = phaseSteps.some((s) => s.status === "running");
  const failed = phaseSteps.some((s) => s.status === "failed");
  const allDone = completed === phaseSteps.length && phaseSteps.length > 0;

  let status: "completed" | "running" | "failed" | "pending" = "pending";
  if (allDone) status = "completed";
  else if (failed) status = "failed";
  else if (running || completed > 0) status = "running";

  return { status, completed, total: phaseSteps.length };
}

function PhaseProgressBar({ steps }: { steps: ResearchStep[] }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {PHASES.map((phase, i) => {
        const { status, completed, total } = PhaseStatus({ steps, phase });
        return (
          <div key={phase.id} className="flex items-center flex-1">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      status === "completed"
                        ? "bg-emerald-500 text-white"
                        : status === "running"
                        ? "bg-[#3289FF] text-white"
                        : status === "failed"
                        ? "bg-red-500 text-white"
                        : "bg-slate-200 text-slate-400"
                    }`}
                  >
                    {status === "completed" ? "✓" : phase.id}
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      status === "completed"
                        ? "text-emerald-600"
                        : status === "running"
                        ? "text-[#3289FF]"
                        : status === "failed"
                        ? "text-red-500"
                        : "text-slate-400"
                    }`}
                  >
                    {phase.label}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">
                  {completed}/{total}
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    status === "completed"
                      ? "bg-emerald-500"
                      : status === "running"
                      ? "bg-[#3289FF]"
                      : status === "failed"
                      ? "bg-red-500"
                      : "bg-slate-200"
                  }`}
                  style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
                />
              </div>
            </div>
            {i < PHASES.length - 1 && (
              <div className={`w-6 h-px mx-1 mt-3 ${
                status === "completed" ? "bg-emerald-300" : "bg-slate-200"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Data preview renderers ---

function CompanyProfilePreview({ data }: { data: StepOutput }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">{data.fullName as string || data.name as string}</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-slate-400">Industry:</span>{" "}
          <span className="text-slate-600">{data.industry as string}</span>
        </div>
        <div>
          <span className="text-slate-400">HQ:</span>{" "}
          <span className="text-slate-600">{data.hqCity as string}, {data.state as string}</span>
        </div>
        <div>
          <span className="text-slate-400">Revenue:</span>{" "}
          <span className="text-slate-600">{(data.revenue as { value?: string })?.value || "—"}</span>
        </div>
        <div>
          <span className="text-slate-400">Employees:</span>{" "}
          <span className="text-slate-600">{(data.employees as { value?: string })?.value || "—"}</span>
        </div>
      </div>
      {data.execSummary ? (
        <p className="text-[11px] text-slate-500 line-clamp-3">{String(data.execSummary)}</p>
      ) : null}
    </div>
  );
}

function TechStackPreview({ data }: { data: StepOutput }) {
  const rawCloud = data.cloudProviders;
  const cloud = Array.isArray(rawCloud) ? rawCloud : Array.isArray((rawCloud as any)?.value) ? (rawCloud as any).value : [];
  const rawWs = data.workspacePlatform;
  const workspace = typeof rawWs === "string" ? rawWs : (rawWs as any)?.value || "—";
  const rawAi = data.knownAIDeployments;
  const ai = Array.isArray(rawAi) ? rawAi : Array.isArray((rawAi as any)?.value) ? (rawAi as any).value : [];
  return (
    <div className="space-y-1.5 text-xs">
      <div><span className="text-slate-400">Cloud:</span> <span className="text-slate-600">{cloud.join(", ") || "—"}</span></div>
      <div><span className="text-slate-400">Workspace:</span> <span className="text-slate-600">{workspace}</span></div>
      <div><span className="text-slate-400">AI/ML:</span> <span className="text-slate-600">{ai.join(", ") || "—"}</span></div>
    </div>
  );
}

function FinancialSignalPreview({ data }: { data: StepOutput }) {
  const [expanded, setExpanded] = useState(false);
  const signals = data.signals as { signal: string; evidence: string }[] || [];
  const visible = expanded ? signals : signals.slice(0, 3);
  return (
    <div className="space-y-1 text-xs">
      {visible.map((s, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <span className="text-emerald-500 mt-0.5">$</span>
          <span className="text-slate-600">{s.signal || s.evidence || JSON.stringify(s).slice(0, 80)}</span>
        </div>
      ))}
      {signals.length > 3 && (
        <button onClick={() => setExpanded(!expanded)} className="text-[#3289FF] hover:underline cursor-pointer">
          {expanded ? "Show less" : `+${signals.length - 3} more`}
        </button>
      )}
      {signals.length === 0 && (
        <p className="text-slate-400">Budget signals extracted</p>
      )}
    </div>
  );
}

function TriggersPreview({ data }: { data: StepOutput }) {
  const [expanded, setExpanded] = useState(false);
  const events = data as unknown as { event: string; category: string; date: string }[];
  const items = Array.isArray(events) ? events : [];
  const visible = expanded ? items : items.slice(0, 4);
  return (
    <div className="space-y-1 text-xs">
      {visible.map((t, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <span className="text-amber-500 mt-0.5">&#9889;</span>
          <div>
            <span className="text-slate-600">{t.event}</span>
            <span className="text-slate-400 ml-1">({t.category})</span>
          </div>
        </div>
      ))}
      {items.length > 4 && (
        <button onClick={() => setExpanded(!expanded)} className="text-[#3289FF] hover:underline cursor-pointer">
          {expanded ? "Show less" : `+${items.length - 4} more`}
        </button>
      )}
    </div>
  );
}

function PainPointsPreview({ data }: { data: StepOutput }) {
  const [expanded, setExpanded] = useState(false);
  const points = data as unknown as { title: string; severity: string }[];
  const items = Array.isArray(points) ? points : [];
  const visible = expanded ? items : items.slice(0, 4);
  return (
    <div className="space-y-1 text-xs">
      {visible.map((p, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <span className={`mt-0.5 ${p.severity === "Critical" ? "text-red-500" : p.severity === "High" ? "text-orange-500" : "text-amber-500"}`}>&#9679;</span>
          <span className="text-slate-600">{p.title}</span>
        </div>
      ))}
      {items.length > 4 && (
        <button onClick={() => setExpanded(!expanded)} className="text-[#3289FF] hover:underline cursor-pointer">
          {expanded ? "Show less" : `+${items.length - 4} more`}
        </button>
      )}
    </div>
  );
}

function StakeholdersPreview({ data }: { data: StepOutput }) {
  const [expanded, setExpanded] = useState(false);
  const people = data as unknown as { name: string; title: string; tier: string }[];
  const items = Array.isArray(people) ? people : [];
  const visible = expanded ? items : items.slice(0, 4);
  return (
    <div className="space-y-1 text-xs">
      {visible.map((s, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <span className="text-[#3289FF] mt-0.5">&#9679;</span>
          <div>
            <span className="text-slate-700 font-medium">{s.name}</span>
            <span className="text-slate-400 ml-1">— {s.title}</span>
          </div>
        </div>
      ))}
      {items.length > 4 && (
        <button onClick={() => setExpanded(!expanded)} className="text-[#3289FF] hover:underline cursor-pointer">
          {expanded ? "Show less" : `+${items.length - 4} more`}
        </button>
      )}
    </div>
  );
}

function SolutionMappingPreview({ data }: { data: StepOutput }) {
  const [expanded, setExpanded] = useState(false);
  const mappings = data as unknown as { solutionName: string; priority: string; painPoint: string }[];
  const items = Array.isArray(mappings) ? mappings : [];
  const visible = expanded ? items : items.slice(0, 4);
  return (
    <div className="space-y-1 text-xs">
      {visible.map((m, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${
            m.priority === "Primary" ? "bg-[rgba(50,137,255,0.08)] text-[#3289FF]" :
            m.priority === "Secondary" ? "bg-emerald-50 text-emerald-600" :
            "bg-slate-100 text-slate-500"
          }`}>{m.priority}</span>
          <span className="text-slate-600">{m.solutionName}</span>
        </div>
      ))}
      {items.length > 4 && (
        <button onClick={() => setExpanded(!expanded)} className="text-[#3289FF] hover:underline cursor-pointer">
          {expanded ? "Show less" : `+${items.length - 4} more`}
        </button>
      )}
    </div>
  );
}

function GTMPreview({ data }: { data: StepOutput }) {
  return (
    <div className="space-y-1.5 text-xs">
      {data.brief ? <p className="text-slate-600 line-clamp-2">{String(data.brief)}</p> : null}
      <div className="flex gap-3">
        {data.urgency ? (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
            String(data.urgency) === "Very High" ? "bg-red-50 text-red-600" :
            String(data.urgency) === "High" ? "bg-orange-50 text-orange-600" :
            "bg-amber-50 text-amber-600"
          }`}>{String(data.urgency)}</span>
        ) : null}
        {data.entrySolution ? (
          <span className="text-slate-400">Entry: <span className="text-slate-600">{String(data.entrySolution).replace(/-/g, " ")}</span></span>
        ) : null}
      </div>
    </div>
  );
}

function ScoringPreview({ data }: { data: StepOutput }) {
  const dims = [
    { key: "budgetSignal", label: "Budget", max: 25 },
    { key: "solutionFit", label: "Solution Fit", max: 25 },
    { key: "triggerRecency", label: "Triggers", max: 20 },
    { key: "aiMaturity", label: "AI Maturity", max: 15 },
    { key: "geminiAlignment", label: "Gemini", max: 15 },
  ];
  return (
    <div className="space-y-1.5">
      {dims.map((d) => {
        const score = data[d.key] as { points?: number } | undefined;
        const pts = score?.points ?? 0;
        return (
          <div key={d.key} className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 w-20">{d.label}</span>
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#3289FF] rounded-full"
                style={{ width: `${(pts / d.max) * 100}%` }}
              />
            </div>
            <span className="text-slate-600 font-medium w-10 text-right">{pts}/{d.max}</span>
          </div>
        );
      })}
    </div>
  );
}

function VerificationPreview({ data }: { data: StepOutput }) {
  const result = data.result as { valid?: boolean; qualityScore?: number; errors?: string[]; warnings?: string[] } | undefined;
  if (!result) return <p className="text-xs text-slate-400">Processing...</p>;
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center gap-2">
        <span className={`px-1.5 py-0.5 rounded font-medium ${result.valid ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
          {result.valid ? "Valid" : "Issues Found"}
        </span>
        <span className="text-slate-400">Quality: <span className="text-slate-700 font-medium">{result.qualityScore}/100</span></span>
      </div>
      {(result.errors?.length ?? 0) > 0 && (
        <p className="text-red-500">{result.errors?.length} error(s)</p>
      )}
      {(result.warnings?.length ?? 0) > 0 && (
        <p className="text-amber-500">{result.warnings?.length} warning(s)</p>
      )}
    </div>
  );
}

const PREVIEW_RENDERERS: Record<string, React.FC<{ data: StepOutput }>> = {
  company_profile: CompanyProfilePreview,
  tech_stack: TechStackPreview,
  financial_signal: FinancialSignalPreview,
  trigger_scanner: TriggersPreview,
  pain_point_analyzer: PainPointsPreview,
  stakeholder_researcher: StakeholdersPreview,
  solution_mapper: SolutionMappingPreview,
  gtm_generator: GTMPreview,
  scoring_agent: ScoringPreview,
  verification: VerificationPreview,
};

// --- Main page ---

export default function ResearchProgressPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const jobId = params.jobId as string;

  const [job, setJob] = useState<Job | null>(null);
  const [profileSlug, setProfileSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPhase, setSelectedPhase] = useState<number>(1);

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/research/${jobId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setJob(data.job);
      setProfileSlug(data.profileSlug);
      setLoading(false);

      // Auto-select the most recent active phase
      if (data.job?.research_steps) {
        const steps = data.job.research_steps as ResearchStep[];
        for (let i = PHASES.length - 1; i >= 0; i--) {
          const phaseSteps = steps.filter((s) => PHASES[i].agents.includes(s.agent_name));
          if (phaseSteps.some((s) => s.status === "running" || s.status === "completed")) {
            setSelectedPhase(PHASES[i].id);
            break;
          }
        }
      }
    } catch {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  // Supabase Realtime subscription
  useEffect(() => {
    const supabase = createBrowserClient();

    const channel = supabase
      .channel(`research-${jobId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "research_jobs", filter: `id=eq.${jobId}` },
        () => fetchJob()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "research_steps" },
        () => fetchJob()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId, fetchJob]);

  // Redirect to profile when completed
  useEffect(() => {
    if (job?.status === "completed" && profileSlug) {
      const timeout = setTimeout(() => {
        router.push(`/projects/${projectId}/company/${profileSlug}`);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [job?.status, profileSlug, projectId, router]);

  // Fallback: if all steps are done but job status is stale, try fetching the profile slug
  useEffect(() => {
    if (!job || job.status === "completed" || job.status === "failed") return;
    const steps = job.research_steps || [];
    const allDone = steps.length > 0 && steps.every((s) => s.status === "completed" || s.status === "failed");
    if (!allDone) return;

    // All steps done but job not marked complete — poll once more after a delay
    const timeout = setTimeout(() => fetchJob(), 5000);
    return () => clearTimeout(timeout);
  }, [job, fetchJob]);

  if (loading) {
    return (
      <div className="animate-fade-in space-y-4 py-8">
        <div className="h-6 w-48 bg-slate-100 rounded animate-pulse" />
        <div className="flex gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex-1 h-12 bg-slate-50 rounded animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-4 h-60 animate-pulse bg-slate-50" />
          <div className="card p-4 h-60 animate-pulse bg-slate-50" />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-slate-500 mb-3">Research job not found.</p>
        <Link href={`/projects/${projectId}`} className="btn-ghost text-sm">Back to Project</Link>
      </div>
    );
  }

  const steps = job.research_steps || [];
  const currentPhase = PHASES.find((p) => p.id === selectedPhase) || PHASES[0];
  const phaseSteps = steps.filter((s) => currentPhase.agents.includes(s.agent_name));

  // Activity feed: recently completed steps + currently running
  const completedSteps = steps
    .filter((s) => s.status === "completed" && s.completed_at)
    .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime());
  const runningSteps = steps.filter((s) => s.status === "running");
  const failedSteps = steps.filter((s) => s.status === "failed");

  const isComplete = job.status === "completed";
  const isFailed = job.status === "failed";
  const allStepsDone = steps.length > 0 && steps.every((s) => s.status === "completed");
  // Only use the real profile slug from DB — never guess from company name
  const derivedSlug = profileSlug;

  return (
    <div className="animate-fade-in">
      <Link
        href={`/projects/${projectId}`}
        className="text-sm text-slate-500 hover:text-[#3289FF] mb-4 inline-flex items-center gap-1 transition-colors"
      >
        &larr; Back to Project
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{job.company_name}</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {isComplete
              ? "Research complete — redirecting to full profile..."
              : isFailed
              ? "Research failed"
              : allStepsDone
              ? "All agents finished — saving profile..."
              : "AI research in progress"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-[#3289FF]">{job.progress}%</span>
          {(isComplete || allStepsDone) && derivedSlug && (
            <Link
              href={`/projects/${projectId}/company/${derivedSlug}`}
              className="btn-primary text-xs"
            >
              View Full Profile &rarr;
            </Link>
          )}
        </div>
      </div>

      {/* Phase Progress Bar */}
      <PhaseProgressBar steps={steps} />

      {/* Phase selector tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-100">
        {PHASES.map((phase) => {
          const { status } = PhaseStatus({ steps, phase });
          const isSelected = selectedPhase === phase.id;
          return (
            <button
              key={phase.id}
              onClick={() => setSelectedPhase(phase.id)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                isSelected
                  ? "border-[#3289FF] text-[#3289FF]"
                  : status === "completed"
                  ? "border-transparent text-emerald-600 hover:text-emerald-700"
                  : status === "running"
                  ? "border-transparent text-[#3289FF]/60 hover:text-[#3289FF]"
                  : "border-transparent text-slate-400 hover:text-slate-500"
              }`}
            >
              Phase {phase.id}: {phase.label}
            </button>
          );
        })}
      </div>

      {/* Two-column layout: Phase data + Activity feed */}
      <div className="grid grid-cols-3 gap-4">
        {/* Left: Phase data (2 cols) */}
        <div className="col-span-2 space-y-3">
          {phaseSteps.map((step) => {
            const Renderer = PREVIEW_RENDERERS[step.agent_name];
            const hasOutput = step.output && Object.keys(step.output).length > 0;

            return (
              <div
                key={step.id}
                className={`card p-4 transition-all ${
                  step.status === "running"
                    ? "border-[#3289FF]/30 shadow-sm"
                    : step.status === "completed"
                    ? "border-emerald-200/60"
                    : step.status === "failed"
                    ? "border-red-200"
                    : "opacity-60"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {step.status === "completed" && (
                      <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px]">✓</span>
                    )}
                    {step.status === "running" && (
                      <span className="w-5 h-5 rounded-full bg-[#3289FF] flex items-center justify-center">
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse-dot" />
                      </span>
                    )}
                    {step.status === "failed" && (
                      <span className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px]">✗</span>
                    )}
                    {step.status === "pending" && (
                      <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center">
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                      </span>
                    )}
                    <span className={`text-sm font-medium ${
                      step.status === "running" ? "text-[#3289FF]" :
                      step.status === "completed" ? "text-slate-700" :
                      step.status === "failed" ? "text-red-600" :
                      "text-slate-400"
                    }`}>
                      {AGENT_LABELS[step.agent_name] || step.agent_name}
                    </span>
                  </div>
                  {step.duration_ms && (
                    <span className="text-[10px] text-slate-400">{(step.duration_ms / 1000).toFixed(1)}s</span>
                  )}
                </div>

                {/* Running state */}
                {step.status === "running" && (
                  <div className="flex items-center gap-2 text-xs text-[#3289FF]">
                    <div className="flex gap-0.5">
                      <span className="w-1 h-1 rounded-full bg-[#3289FF] animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1 h-1 rounded-full bg-[#3289FF] animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1 h-1 rounded-full bg-[#3289FF] animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    Analyzing...
                  </div>
                )}

                {/* Output preview */}
                {step.status === "completed" && hasOutput && Renderer && (
                  <div className="mt-1 pt-2 border-t border-slate-100">
                    <Renderer data={step.output as StepOutput} />
                  </div>
                )}

                {/* Error state */}
                {step.status === "failed" && step.error_message && (
                  <p className="text-xs text-red-500 mt-1">{step.error_message}</p>
                )}
              </div>
            );
          })}

          {phaseSteps.length === 0 && (
            <div className="card p-8 text-center">
              <p className="text-xs text-slate-400">This phase hasn&apos;t started yet</p>
            </div>
          )}
        </div>

        {/* Right: Activity feed (1 col) */}
        <div className="space-y-3">
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-600 mb-3">Live Activity</h3>

            {/* Currently running */}
            {runningSteps.map((step) => (
              <div key={step.id} className="flex items-start gap-2 mb-3 pb-3 border-b border-slate-100 last:border-0">
                <span className="w-2 h-2 rounded-full bg-[#3289FF] mt-1 animate-pulse-dot flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-[#3289FF]">
                    {AGENT_LABELS[step.agent_name]}
                  </p>
                  <p className="text-[10px] text-slate-400">Running...</p>
                </div>
              </div>
            ))}

            {/* Failed */}
            {failedSteps.map((step) => (
              <div key={step.id} className="flex items-start gap-2 mb-3 pb-3 border-b border-slate-100 last:border-0">
                <span className="text-red-500 text-xs mt-0.5 flex-shrink-0">✗</span>
                <div>
                  <p className="text-xs font-medium text-red-500">
                    {AGENT_LABELS[step.agent_name]}
                  </p>
                  <p className="text-[10px] text-red-400 line-clamp-2">{step.error_message}</p>
                </div>
              </div>
            ))}

            {runningSteps.length === 0 && failedSteps.length === 0 && !isComplete && (
              <p className="text-xs text-slate-400 mb-3">Waiting for next agent...</p>
            )}

            {isComplete && (
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
                <span className="text-emerald-500">✓</span>
                <p className="text-xs font-medium text-emerald-600">Research complete!</p>
              </div>
            )}
          </div>

          {/* Recently completed */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-600 mb-3">Completed Steps</h3>
            <div className="space-y-2">
              {completedSteps.map((step) => (
                <div key={step.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-500 text-[10px]">✓</span>
                    <span className="text-[11px] text-slate-600">
                      {AGENT_LABELS[step.agent_name]}
                    </span>
                  </div>
                  {step.duration_ms && (
                    <span className="text-[10px] text-slate-400">
                      {(step.duration_ms / 1000).toFixed(0)}s
                    </span>
                  )}
                </div>
              ))}
              {completedSteps.length === 0 && (
                <p className="text-[11px] text-slate-400">No steps completed yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
