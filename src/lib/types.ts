// === Citation System ===

export interface Source {
  label: string;
  url: string;
  date: string;
  type: "10-K" | "10-Q" | "8-K" | "Earnings Transcript" | "News" | "Press Release" | "Industry Report" | "Job Posting" | "Company Website" | "Analyst Report";
}

export interface CitedValue<T> {
  value: T;
  sources: Source[];
}

// === Scoring ===

export type Rating = "A" | "B" | "C" | "D" | "E" | "F";

export const RATING_LABELS: Record<Rating, string> = {
  A: "Must Pursue", B: "High Priority", C: "Solid Target",
  D: "Watch List", E: "Long Shot", F: "Not Now",
};

export const RATING_COLORS: Record<Rating, string> = {
  A: "emerald", B: "blue", C: "amber", D: "orange", E: "red", F: "slate",
};

export function scoreToRating(score: number): Rating {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  if (score >= 20) return "E";
  return "F";
}

export interface DimensionScore {
  points: number;
  maxPoints: number;
  reasoning: string;
  sources: Source[];
}

export interface ScoreBreakdown {
  budgetSignal: DimensionScore;
  solutionFit: DimensionScore;
  triggerRecency: DimensionScore;
  aiMaturity: DimensionScore;
  geminiAlignment: DimensionScore;
}

// === Solutions ===

export type SolutionId =
  | "contract-intelligence" | "scheduling-intelligence" | "contextual-search"
  | "ai-voice-assistants" | "gemini-land" | "gemini-expand"
  | "requirement-ai" | "value-finder";

export const ALL_SOLUTIONS: { id: SolutionId; name: string; shortName: string }[] = [
  { id: "contract-intelligence", name: "Contract Intelligence", shortName: "Contracts" },
  { id: "scheduling-intelligence", name: "Scheduling Intelligence", shortName: "Scheduling" },
  { id: "contextual-search", name: "Contextual Search (Agentspace)", shortName: "Agentspace" },
  { id: "ai-voice-assistants", name: "AI Voice Assistants", shortName: "Voice AI" },
  { id: "gemini-land", name: "Gemini Enterprise Land", shortName: "GE Land" },
  { id: "gemini-expand", name: "Gemini Enterprise Expand", shortName: "GE Expand" },
  { id: "requirement-ai", name: "Requirement AI", shortName: "Req AI" },
  { id: "value-finder", name: "Value Finder", shortName: "Value Finder" },
];

// === Stakeholders ===

export interface Stakeholder {
  name: string;
  title: string;
  tier: "Decision Maker" | "Champion" | "Influencer";
  relevance: string;
  source: string;
  sourceUrl: string;
  confidence: "verified" | "likely" | "unverified";
}

// === Company Data ===

export interface SolutionMapping {
  solution: SolutionId;
  solutionName: string;
  painPoint: string;
  value: string;
  proofPoint: { client: string; relevance: string; outcome: string };
  priority: "Primary" | "Secondary" | "Tertiary";
  reasoning: string;
  estimatedImpact: string;
  sources: Source[];
}

export interface TriggerEvent {
  event: string;
  date: string;
  category: "M&A" | "Leadership" | "Earnings Pressure" | "Regulatory" | "Legacy Systems" | "Competitor Pressure" | "Digital Transformation" | "Workforce";
  detail: string;
  impact: string;
  sources: Source[];
}

export interface PainPoint {
  title: string;
  description: string;
  severity: "Critical" | "High" | "Medium";
  affectedFunctions: string[];
  techolutionSolutions: SolutionId[];
  sources: Source[];
}

export interface TechLandscape {
  cloudProviders: CitedValue<string[]>;
  workspacePlatform: CitedValue<string>;
  knownAIDeployments: CitedValue<string[]>;
  knownVendors: CitedValue<string[]>;
  knownSystems: CitedValue<string[]>;
}

export interface PilotStrategy {
  title: string;
  scope: string;
  duration: string;
  successMetric: string;
  estimatedBudget: string;
}

export interface GTMStrategy {
  brief: string;
  entrySolution: SolutionId;
  entrySolutionReasoning: string;
  entryStrategy: string[];
  pilotStrategy: PilotStrategy;
  expandPath: string;
  competitivePositioning: string;
  urgency: "Very High" | "High" | "Medium" | "Low";
  urgencyReasoning: string;
  sources: Source[];
}

export type GeminiStatus = "land" | "expand" | "explore" | "none";

export interface CompanyDetail {
  slug: string;
  name: string;
  fullName: string;
  industry: string;
  subSector: string;
  hqCity: string;
  state: string;
  revenue: CitedValue<string>;
  employees: CitedValue<string>;
  businessDescription: string;
  execSummary: string;
  triggerEvents: TriggerEvent[];
  painPoints: PainPoint[];
  techLandscape: TechLandscape;
  solutionMappings: SolutionMapping[];
  gtm: GTMStrategy;
  scores: ScoreBreakdown;
  totalScore: number;
  rating: Rating;
  geminiStatus: GeminiStatus;
  stakeholders: Stakeholder[];
  relatedCompanies: { slug: string; name: string; relationship: string }[];
  sources: Source[];
  generatedDate: string;
  lastUpdated: string;
}

// === Database types ===

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  company_count: number;
  created_at: string;
  updated_at: string;
}

export interface ResearchJob {
  id: string;
  project_id: string;
  user_id: string;
  company_name: string;
  company_context: Record<string, string>;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface ResearchStep {
  id: string;
  job_id: string;
  agent_name: string;
  phase: number;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  output: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
}

export interface CompanyProfile {
  id: string;
  job_id: string;
  project_id: string;
  user_id: string;
  slug: string;
  data: CompanyDetail;
  total_score: number;
  rating: Rating;
  industry: string;
  urgency: string;
  primary_solution: string;
  gemini_status: string;
  created_at: string;
  updated_at: string;
}
