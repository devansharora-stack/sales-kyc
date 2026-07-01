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

export interface OpportunityValue {
  score: number;
  estimatedFirstYear: string;
  estimatedExpansion: string;
  reasoning: string;
}

export type SalesMotionType = "Quick Win" | "Land & Expand" | "Strategic Sale" | "Long Cycle";

export interface SalesMotion {
  score: number;
  motion: SalesMotionType;
  cycleLength: string;
  buildVsBuyRisk: "Low" | "Medium" | "High";
  reasoning: string;
}

export interface SalesIntelligence {
  opportunityValue: OpportunityValue;
  salesMotion: SalesMotion;
}

// === Solutions ===

export type SolutionId =
  // BPA 4.0
  | "bpa-value-finder" | "bpa-100k" | "bpa-full"
  // Gemini Enterprise
  | "ge-land-native" | "ge-land-adk" | "ge-expand-agents"
  | "ge-enablement" | "ge-managed-services"
  // Managed Services
  | "managed-services"
  // Dev
  | "dev-cloud-migration" | "dev-digital-modernization"
  | "dev-app-design" | "dev-data-readiness"
  // Legacy IDs (backwards compatibility with existing profiles)
  | "contract-intelligence" | "scheduling-intelligence" | "contextual-search"
  | "ai-voice-assistants" | "gemini-land" | "gemini-expand"
  | "requirement-ai" | "value-finder";

export const ALL_SOLUTIONS: { id: SolutionId; name: string; shortName: string }[] = [
  // BPA 4.0
  { id: "bpa-value-finder", name: "BPA 4.0 — Value Finder", shortName: "Value Finder" },
  { id: "bpa-100k", name: "BPA 4.0 — 100K Challenge", shortName: "100K Challenge" },
  { id: "bpa-full", name: "BPA 4.0 — Full / Pro", shortName: "BPA Full" },
  // Gemini Enterprise
  { id: "ge-land-native", name: "GE Land — Native Connector", shortName: "GE Native" },
  { id: "ge-land-adk", name: "GE Land — ADK Connector", shortName: "GE ADK" },
  { id: "ge-expand-agents", name: "GE Expand — Custom Agents", shortName: "GE Agents" },
  { id: "ge-enablement", name: "GE Enablement", shortName: "GE Enable" },
  { id: "ge-managed-services", name: "GE Managed Services", shortName: "GE MS" },
  // Managed Services
  { id: "managed-services", name: "Managed Services", shortName: "Managed" },
  // Dev
  { id: "dev-cloud-migration", name: "Cloud Migration", shortName: "Cloud Mig" },
  { id: "dev-digital-modernization", name: "Digital Modernization", shortName: "Dig Mod" },
  { id: "dev-app-design", name: "App Design & Development", shortName: "App Dev" },
  { id: "dev-data-readiness", name: "AI Data Readiness", shortName: "Data Ready" },
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

// === Deep Stakeholder Analysis ===

export type IntelQuality = "HIGH" | "MEDIUM" | "LOW";

export interface StakeholderExperience {
  position: string;
  company: string;
  startDate?: string;
  endDate?: string;
  duration?: string;
  location?: string;
  description?: string;
}

export interface StakeholderEducation {
  school: string;
  degree?: string;
  fieldOfStudy?: string;
}

export interface StakeholderCertification {
  title: string;
  issuer?: string;
}

export interface StakeholderOrganization {
  title: string;
  role?: string;
}

export interface StakeholderAward {
  title: string;
  issuer?: string;
}

export interface StakeholderVolunteering {
  role: string;
  organization?: string;
}

export interface StakeholderPost {
  text: string;
  date?: string;
  likes?: number;
  comments?: number;
  url?: string;
}

export interface StakeholderCompanyIntel {
  companyName?: string;
  industry?: string;
  employeeCount?: string;
  revenue?: string;
  yearFounded?: string;
  specialities?: string[];
}

// AI synthesis — mirrors webinar-intel's intelBrief
export interface StakeholderIntelBrief {
  intelQuality: IntelQuality;
  intelQualityReason: string;
  // Buying-process classification, assigned by the deep-analysis synthesizer.
  // Absent on older profiles synthesized before this field existed.
  tier?: "Decision Maker" | "Champion" | "Influencer";
  executiveSummary: string;
  keyInsight: string;
  careerNarrative: { role: string; tenure?: string; takeaway: string }[];
  verifiedPriorities: { priority: string; evidence: string; confidence: IntelQuality; sourceUrl?: string }[];
  painPoints: { pain: string; evidence: string; confidence: IntelQuality; sourceUrl?: string }[];
  postInsights: { headline: string; insight: string; engagement?: string; sourceUrl?: string }[];
  engagementApproach: { openingAngle: string; talkingPoints: string[]; avoidTopics: string[] };
}

// Drives the header "Intel coverage" checklist
export interface StakeholderDataRichness {
  score: number;
  about: boolean;
  experience: boolean;
  skills: boolean;
  posts: boolean;
  certifications: boolean;
  companyData: boolean;
  organizations: boolean;
}

export interface DeepStakeholderProfile {
  // Raw (normalized from scrapers)
  fullName: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  photoUrl?: string;
  linkedinUrl?: string;
  location?: string;
  about?: string;
  experience: StakeholderExperience[];
  skills: string[];
  education: StakeholderEducation[];
  certifications: StakeholderCertification[];
  organizations: StakeholderOrganization[];
  languages: string[];
  honorsAndAwards: StakeholderAward[];
  volunteering: StakeholderVolunteering[];
  connectionsCount?: number;
  followerCount?: number;
  posts: StakeholderPost[];
  companyIntel?: StakeholderCompanyIntel;
  // AI synthesis + coverage
  intelBrief: StakeholderIntelBrief;
  dataRichness: StakeholderDataRichness;
}

// === Per-stakeholder sales scripts ===

export type ScriptTone = "receptive" | "analytical" | "skeptical";

export interface ScriptLine {
  speaker: "rep" | "prospect" | "direction"; // direction = [pause] / stage note
  text: string;
}

export interface ScriptObjection {
  objection: string;
  response: string;
}

export interface StakeholderScript {
  tone: ScriptTone;
  toneLabel: string; // e.g. "The Open Book", "The Neutral Professional"
  scenario: string; // 1-line setting grounded in this person's role/context
  lines: ScriptLine[];
  objections: ScriptObjection[];
  leaveBehind: string;
}

export interface StakeholderScriptSet {
  offeringId: string; // SolutionId or KB offering id actually pitched
  offeringName: string;
  predictedTone: ScriptTone;
  predictedToneReason: string;
  generatedAt: string; // ISO
  variants: StakeholderScript[]; // exactly 3, one per tone
}

export type StakeholderStatus =
  | "queued" | "resolving" | "needs_confirmation" | "scraping"
  | "synthesizing" | "completed" | "failed" | "cancelled" | "departed";

export interface StakeholderRecord {
  id: string;
  project_id: string;
  company_profile_id: string | null;
  user_id: string;
  name: string;
  company: string | null;
  title: string | null;
  linkedin_url: string | null;
  url_confidence: "high" | "low" | "confirmed" | null;
  input_type: "manual" | "csv" | "company" | null;
  status: StakeholderStatus;
  progress: number;
  data: { raw?: Record<string, unknown>; profile?: DeepStakeholderProfile; scripts?: StakeholderScriptSet } | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// === Company Data ===

export interface FitScoreBreakdown {
  painSeverity: number;
  budgetEvidence: number;
  proofRelevance: number;
  impactMagnitude: number;
}

export interface EstimatedImpact {
  summary: string;
  reasoning: string[];
  sources?: Source[];
}

export interface SolutionMapping {
  solution: SolutionId;
  solutionName: string;
  painPoint: string;
  value: string;
  proofPoint: { client: string; relevance: string; outcome: string };
  priority: "Primary" | "Secondary" | "Tertiary";
  reasoning: string;
  estimatedImpact: string | EstimatedImpact;
  fitScore?: number;
  fitScoreBreakdown?: FitScoreBreakdown;
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
  briefSources?: Source[];
  entrySolution: SolutionId;
  entrySolutionReasoning: string;
  entrySolutionSources?: Source[];
  entryStrategy: string[];
  pilotStrategy: PilotStrategy;
  expandPath: string;
  competitivePositioning: string;
  competitiveSources?: Source[];
  urgency: "Very High" | "High" | "Medium" | "Low";
  urgencyReasoning: string;
  urgencySources?: Source[];
  sources: Source[];
}

export type GeminiStatus = "land" | "expand" | "explore" | "none";

// === Partner Landscape ===

export interface PartnerEntry {
  partner: string;
  domain: string; // e.g. "ERP & Integration", "OT / Manufacturing"
  whatTheyDeliver: string;
  techolutionOpportunity: string; // "what they DON'T do" — the Techolution gap/opening
  sources: Source[];
}

// === Stakeholder × Offering Matrix ===

export type CellStrength = "strong" | "conditional" | "none";

export interface MatrixCell {
  solution: SolutionId;
  solutionName: string;
  // Power/role label for this stakeholder × offering, e.g. PRIMARY, APPROVE,
  // CHAMPION, SUPPORT, ENTRY, FINANCE GATE, STRATEGIC. Empty when no relationship.
  role: string;
  strength: CellStrength;
  rationale: string; // short, 1-2 lines on why and how to approach
}

export interface MatrixRow {
  stakeholderName: string;
  title: string;
  powerLabel: string; // e.g. "PRIMARY DECISION MAKER", "BUDGET APPROVER", "EXEC SPONSOR"
  cells: MatrixCell[]; // one per solution column, in solutionColumns order
  enriched?: boolean; // true when built using this person's deep-research intel brief
}

export interface StakeholderOfferingMatrix {
  solutionColumns: { id: SolutionId; name: string; shortName: string }[];
  rows: MatrixRow[];
}

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
  partnerLandscape: PartnerEntry[];
  stakeholderOfferingMatrix?: StakeholderOfferingMatrix;
  salesIntelligence?: SalesIntelligence;
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
