/**
 * Value Finder — vetted benchmark library.
 *
 * The client-facing report shows a quantified "impact" per finding as
 * (real industry benchmark %) applied to (the company's own real scale figure).
 *
 * To keep the constraint "numbers must have a proper backing" true, the % NEVER
 * comes from the LLM. The LLM only PICKS a category key; the actual statistic,
 * publisher, year and URL are looked up here from vetted, cited research. If a
 * category isn't matched, no impact number is shown for that finding.
 *
 * Every entry MUST be a real, traceable published figure. Do not add invented,
 * estimated, or unsourced stats.
 */

export interface Benchmark {
  category: string;
  statShort: string; // <= ~22 chars, e.g. "~30% faster ramp"
  stat: string;      // full phrasing of the benchmark
  publisher: string;
  title: string;
  year: string;
  url: string;
}

// Category keys the LLM may choose from (kept stable; order irrelevant).
export const BENCHMARK_CATEGORIES = [
  "onboarding-ramp",
  "knowledge-management",
  "compliance-reporting",
  "contract-management",
  "cloud-infra-ops",
  "customer-support",
  "sales-revops",
  "security-ops",
  "data-quality",
  "document-processing",
] as const;

export type BenchmarkCategory = (typeof BENCHMARK_CATEGORIES)[number];

export function isBenchmarkCategory(k: string): k is BenchmarkCategory {
  return (BENCHMARK_CATEGORIES as readonly string[]).includes(k);
}

// Populated from vetted research — every entry traces to the cited publication.
// Do not add unsourced or invented figures.
export const BENCHMARKS: Record<BenchmarkCategory, Benchmark> = {
  "onboarding-ramp": {
    category: "onboarding-ramp",
    statShort: "3x faster ramp",
    stat: "AI-assisted new agents reached in ~2 months the proficiency unsupported peers took ~6 months to reach.",
    publisher: "NBER / Stanford",
    title: "Generative AI at Work (Brynjolfsson, Li, Raymond)",
    year: "2023",
    url: "https://www.nber.org/papers/w31161",
  },
  "knowledge-management": {
    category: "knowledge-management",
    statShort: "+20-25% output",
    stat: "Knowledge/social technologies can raise interaction-worker productivity by 20-25%; workers spend ~1 day/week searching for internal information.",
    publisher: "McKinsey Global Institute",
    title: "The social economy: Unlocking value and productivity through social technologies",
    year: "2012",
    url: "https://www.mckinsey.com/industries/technology-media-and-telecommunications/our-insights/the-social-economy",
  },
  "compliance-reporting": {
    category: "compliance-reporting",
    statShort: "-30% reporting cost",
    stat: "Austria's AuRep shared regulatory-reporting platform cut bank regulatory-reporting cost by more than 30%.",
    publisher: "Deloitte Insights",
    title: "The regulator's new toolkit: Technologies and tactics for tomorrow's regulator",
    year: "2018",
    url: "https://www.deloitte.com/us/en/insights/industry/government-public-sector-services/reducing-compliance-costs-with-regtech.html",
  },
  "contract-management": {
    category: "contract-management",
    statShort: "26s vs 92min",
    stat: "AI reviewed 5 NDAs in 26 seconds vs an average 92 minutes for 20 experienced lawyers, at higher accuracy (94% vs 85%).",
    publisher: "LawGeex",
    title: "Comparing the Performance of Artificial Intelligence to Human Lawyers in the Review of Standard Business Contracts",
    year: "2018",
    url: "https://images.law.com/contrib/content/uploads/documents/397/5408/lawgeex.pdf",
  },
  "cloud-infra-ops": {
    category: "cloud-infra-ops",
    statShort: "34% faster migration",
    stat: "Using agentic AI, Vector Limited completed its cloud migration 34% faster and achieved 35% five-year TCO savings.",
    publisher: "AWS",
    title: "Vector Limited Accelerates VMware Migration Using Agentic AI with AWS Transform",
    year: "2025",
    url: "https://aws.amazon.com/solutions/case-studies/vector-limited-case-study",
  },
  "customer-support": {
    category: "customer-support",
    statShort: "+14% resolutions",
    stat: "A generative-AI assistant lifted customer-support issues resolved per hour by 14% on average, up to 34% for novice agents.",
    publisher: "NBER / Stanford",
    title: "Generative AI at Work (Brynjolfsson, Li, Raymond)",
    year: "2023",
    url: "https://www.nber.org/papers/w31161",
  },
  "sales-revops": {
    category: "sales-revops",
    statShort: "+3-5% sales value",
    stat: "Generative AI could deliver sales-productivity gains worth roughly 3-5% of current global sales spend.",
    publisher: "McKinsey",
    title: "The economic potential of generative AI: The next productivity frontier",
    year: "2023",
    url: "https://www.mckinsey.com/capabilities/tech-and-ai/our-insights/the-economic-potential-of-generative-ai-the-next-productivity-frontier",
  },
  "security-ops": {
    category: "security-ops",
    statShort: "$1.9M lower cost",
    stat: "Organizations using security AI and automation extensively saved ~$1.9M per breach and contained breaches faster.",
    publisher: "IBM / Ponemon",
    title: "Cost of a Data Breach Report 2025",
    year: "2025",
    url: "https://www.ibm.com/reports/data-breach",
  },
  "data-quality": {
    category: "data-quality",
    statShort: "~45% automatable",
    stat: "~45% of the activities workers are paid to perform can be automated with current technology; data collection and processing rank among the most automatable.",
    publisher: "McKinsey",
    title: "Four fundamentals of workplace automation",
    year: "2016",
    url: "https://www.mckinsey.com/capabilities/mckinsey-digital/our-insights/four-fundamentals-of-workplace-automation",
  },
  "document-processing": {
    category: "document-processing",
    statShort: "~32% cost cut",
    stat: "Organizations that scaled intelligent automation reported an average 32% cost reduction in targeted back-office processes.",
    publisher: "Deloitte",
    title: "Automation with intelligence: Deloitte Global Intelligent Automation survey",
    year: "2022",
    url: "https://www.deloitte.com/us/en/insights/topics/talent/intelligent-automation-2022-survey-results.html",
  },
};

export interface ResolvedImpact {
  stat: string;          // benchmark headline, e.g. "~30% faster ramp"
  scope: string;         // applied to their scale, e.g. "across your 250+ specialists"
  benchmarkCite: string; // e.g. "McKinsey 2023"
  benchmarkUrl: string;
  scale: string;         // their real figure, e.g. "30→250" (may be "")
  scaleSource: string;   // their source label (may be "")
}

/**
 * Resolve the impact box for a finding. Returns null when the finding has no
 * matched benchmark category (so the box is simply omitted — never faked).
 */
export function resolveImpact(c: {
  benchmarkCategory?: string;
  appliedScope?: string;
  metric?: string;
  metricSource?: string;
} | undefined): ResolvedImpact | null {
  if (!c) return null;
  const cat = (c.benchmarkCategory || "").trim();
  if (!isBenchmarkCategory(cat)) return null;
  const b = BENCHMARKS[cat];
  if (!b) return null;
  const metric = (c.metric || "").trim();
  const scope =
    (c.appliedScope || "").trim() || (metric ? `across your ${metric}` : "across your teams");
  return {
    stat: b.statShort,
    scope,
    benchmarkCite: `${b.publisher} ${b.year}`.trim(),
    benchmarkUrl: b.url,
    scale: metric,
    scaleSource: (c.metricSource || "").trim(),
  };
}
