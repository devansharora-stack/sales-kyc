# KYC Genie — Complete Project Prompt

Use this prompt to recreate the entire project from scratch. Give this to Claude Code or any AI coding assistant.

---

## The Prompt

Build me a full-stack AI-powered company research platform called **KYC Genie**. It's a self-service tool for a sales team (Techolution) where users upload company names, an AI agent pipeline automatically researches each company, and results appear in a real-time dashboard with scores, GTM strategies, and stakeholder intel.

The output must be **sales-ready** — reps will act on this data in client meetings without manual review.

### Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js (latest) + TypeScript + Tailwind CSS v4 |
| Database | Supabase (PostgreSQL + Realtime for live progress) |
| AI | Claude Opus via Azure AI Foundry (all agents) |
| Background Jobs | Inngest (serverless step functions with retries) |
| Auth | NextAuth.js v4 + Google OAuth (restricted to @techolution.com domain) |
| Deploy | Vercel |

### What the User Does

1. Logs in with Google (@techolution.com only)
2. Creates a **Project** (e.g., "Healthcare Q2 Targets")
3. Uploads a CSV with company names OR types them manually
4. Watches **live progress** as AI agents research each company (~5-7 min per company)
5. Gets full company profiles with scores, GTM strategy, stakeholders, pain points, solution mappings

### Database Schema (Supabase)

```sql
-- Users (synced from NextAuth)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  image TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Projects (research batches)
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  company_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Research Jobs (one per company being researched)
CREATE TABLE research_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  company_context JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  progress INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Research Steps (individual agent runs within a job)
CREATE TABLE research_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES research_jobs(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  phase INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  output JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INT
);

-- Company Profiles (final assembled output)
CREATE TABLE company_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES research_jobs(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  data JSONB NOT NULL,
  total_score INT,
  rating TEXT,
  industry TEXT,
  urgency TEXT,
  primary_solution TEXT,
  gemini_status TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, slug)
);

-- Indexes
CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_jobs_project ON research_jobs(project_id);
CREATE INDEX idx_jobs_status ON research_jobs(status);
CREATE INDEX idx_steps_job ON research_steps(job_id);
CREATE INDEX idx_profiles_project ON company_profiles(project_id);
CREATE INDEX idx_profiles_rating ON company_profiles(rating);

-- Enable Realtime for live progress
ALTER PUBLICATION supabase_realtime ADD TABLE research_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE research_steps;
ALTER PUBLICATION supabase_realtime ADD TABLE company_profiles;
```

### 10-Agent Pipeline

The pipeline has 4 phases. Each agent gets a system prompt markdown file and outputs structured JSON. The orchestrator is an Inngest step function.

```
Phase 1: Foundation (sequential, 3 agents)
  ├── Company Profile Agent → slug, name, fullName, industry, HQ, revenue, employees, description, execSummary
  ├── Tech Stack Agent → cloudProviders, workspacePlatform, knownAIDeployments, knownVendors, knownSystems
  └── Financial Signal Agent → budget evidence, tech investment signals, AI hiring signals

Phase 2: Intelligence (sequential, 3 agents — each builds on Phase 1)
  ├── Trigger Scanner → TriggerEvent[] (M&A, Leadership, Earnings, Regulatory, Legacy, Competitor, Digital, Workforce)
  ├── Pain Point Analyzer → PainPoint[] with severity + mapped Techolution solutions
  └── Stakeholder Researcher → Stakeholder[] with name, title, tier (Decision Maker/Champion/Influencer), confidence

Phase 3: Synthesis (sequential, 3 agents — each builds on all prior)
  ├── Solution Mapper → SolutionMapping[] with priority (Primary/Secondary/Tertiary), proof points
  ├── GTM Generator → GTMStrategy (entry solution, pilot strategy, expand path, urgency, competitive positioning)
  └── Scoring Agent → ScoreBreakdown (5 dimensions, 100 points total)

Phase 4: Verification (1 agent)
  └── Verification Agent → 5-layer quality gate:
      1. Structural validation (TypeScript) — score math, ranges, required fields
      2. Source URL verification (HTTP) — HEAD/GET check, removes dead links
      3. Stakeholder verification (HTTP + LLM) — checks name on source page, assigns confidence: verified/likely/unverified
      4. Cross-reference consistency (LLM) — finds contradictions between sections
      5. Content quality scoring (LLM) — flags generic/fabricated content, scores 0-100
```

### Scoring System (100 points, 5 dimensions)

| Dimension | Max Points | What It Measures |
|-----------|-----------|-----------------|
| Budget Signal | 25 | Evidence of tech spending capacity (revenue, R&D, hiring) |
| Solution Fit | 25 | How well Techolution's solutions match their pain points |
| Trigger Recency | 20 | Recent events that create urgency (M&A, leadership change, earnings pressure) |
| AI Maturity | 15 | Current AI adoption level (higher = more ready to buy) |
| Gemini Alignment | 15 | Google Workspace usage (for Gemini Enterprise land/expand plays) |

**Ratings**: A (80+) Must Pursue, B (65-79) High Priority, C (50-64) Solid Target, D (35-49) Watch List, E (20-34) Long Shot, F (<20) Not Now

### Techolution's 8 Solutions

Every pain point and solution mapping references these:

1. **Contract Intelligence** — AI contract analysis, extraction, risk scoring
2. **Scheduling Intelligence** — AI-powered workforce/resource scheduling optimization
3. **Contextual Search (Agentspace)** — Enterprise knowledge search across systems (Google Agentspace partner)
4. **AI Voice Assistants** — Voice-based customer service automation
5. **Gemini Enterprise Land** — Deploy Google Gemini for new Google Workspace customers
6. **Gemini Enterprise Expand** — Expand Gemini usage for existing Google Workspace customers
7. **Requirement AI** — AI-powered requirements gathering and conflict detection
8. **Value Finder** — AI assessment tool to identify automation opportunities across business functions

### Stakeholder Confidence System

Stakeholders are NOT removed if unverifiable. Instead, each gets a confidence level:
- **verified** — name found on a live source page (HTTP fetch + text search)
- **likely** — source URL is live but name not found (paywall/JS) OR LLM confirms the person is a known executive
- **unverified** — source URL dead, LLM couldn't confirm. Kept but flagged with warning.

The UI shows color-coded badges: green (Verified), blue (Likely), amber (Unverified).

### Company Detail Data Model (CompanyDetail)

This is the canonical type — the final output saved to `company_profiles.data`:

```typescript
interface CompanyDetail {
  slug: string;
  name: string;
  fullName: string;
  industry: string;
  subSector: string;
  hqCity: string;
  state: string;
  revenue: CitedValue<string>;        // { value: "$X.XB", sources: [...] }
  employees: CitedValue<string>;
  businessDescription: string;
  execSummary: string;
  triggerEvents: TriggerEvent[];       // 5-8 events, each with sources
  painPoints: PainPoint[];             // severity: Critical/High/Medium
  techLandscape: TechLandscape;        // cloud, workspace, AI, vendors
  solutionMappings: SolutionMapping[]; // priority: Primary/Secondary/Tertiary
  gtm: GTMStrategy;                   // entry, pilot, expand, urgency
  scores: ScoreBreakdown;             // 5 dimensions with points + reasoning
  totalScore: number;                 // 0-100
  rating: Rating;                     // A-F
  geminiStatus: GeminiStatus;         // land/expand/explore/none
  stakeholders: Stakeholder[];        // with confidence levels
  relatedCompanies: { slug: string; name: string; relationship: string }[];
  sources: Source[];                   // deduplicated bibliography
  generatedDate: string;
  lastUpdated: string;
}

interface Source {
  label: string;
  url: string;
  date: string;
  type: "10-K" | "10-Q" | "8-K" | "Earnings Transcript" | "News" | "Press Release" | "Industry Report" | "Job Posting" | "Company Website" | "Analyst Report";
}
```

### Agent Instruction Files

Each agent gets a system prompt as a markdown file (`src/instructions/{agent-name}.md`). The base `system-prompt.md` is prepended to ALL agents and contains:
- Techolution company overview and positioning
- All 8 solutions with detailed capabilities and real case studies
- The 5-dimension scoring rubric with exact point ranges
- Citation requirements (every claim needs a source with URL, date, type)
- Anti-hallucination rules:
  - NEVER fabricate source URLs, stakeholder names, or financial figures
  - NEVER construct plausible-looking URLs by pattern-matching
  - Proof points must use real named clients or be labeled "Industry benchmark"
  - "Sales reps will use this data in client meetings. A fabricated name or dead URL destroys credibility."
- Output format rules (structured JSON matching TypeScript interfaces)

### Claude Client (Azure AI Foundry)

```typescript
// Endpoint: AZURE_AI_FOUNDRY_ENDPOINT + "/anthropic/v1/messages"
// Model: claude-opus-4-6
// Temperature: 0.2 (deterministic)
// Retries: 4 attempts with 10s/20s/30s backoff on 429, 503, 529 errors
// JSON parsing: 3-tier strategy:
//   1. Extract from ```json ... ``` code blocks
//   2. Strip leading/trailing fences
//   3. Find first { or [ and parse from there
```

### UI Pages

**1. Dashboard (`/`)** — Project list with stats (completed, in progress, failed counts)

**2. New Project (`/projects/new`)** — Create project + upload CSV/Excel or manual entry

**3. Project Detail (`/projects/[projectId]`)** — Company table (completed profiles with score/rating/urgency/solution columns), active research cards (clickable → goes to research progress view), failed jobs with retry button, add more companies input

**4. Research Progress (`/projects/[projectId]/research/[jobId]`)** — THIS IS KEY:
- **Top**: 4-phase progress bar with numbered circles (green=done, blue=running, gray=pending)
- **Phase tabs**: Click any phase to see its agents
- **Left (2/3 width)**: Each agent shows as a card:
  - Pending: grayed out
  - Running: blue border with animated dots
  - Completed: green checkmark + formatted preview of extracted data
  - Failed: red with error message
- **Right (1/3 width)**: Live activity feed showing currently running agent + completed steps timeline with durations
- **Supabase Realtime**: Page auto-updates as agents complete
- **Auto-redirect**: When all done, redirects to full company profile after 2 seconds

**5. Company Profile (`/projects/[projectId]/company/[slug]`)** — Full profile with 5 tabs:
- **Overview**: Hero card (name, industry, HQ, revenue, employees, score, rating), exec summary, score breakdown with bars
- **Intelligence**: Trigger events (categorized, with sources), pain points (severity-colored), tech landscape
- **GTM Strategy**: Entry solution, pilot strategy, expand path, urgency, competitive positioning
- **Stakeholders**: Cards grouped by tier (Decision Maker/Champion/Influencer), with confidence badges (Verified/Likely/Unverified)
- **Sources**: Full bibliography of all cited sources

### Design System

- Clean, minimal design with lots of white space
- Primary color: `#3289FF` (blue)
- Cards: white bg, `border-[#E2E8F0]`, subtle shadow
- Rating badges: A=emerald, B=blue, C=amber, D=orange, E=red, F=slate
- Font: system sans-serif, small text (11-13px for data, 10px for labels)
- Progress sidebar on the left (~300px, collapsible) showing all active research across projects

### Inngest Orchestrator

The orchestrator is an Inngest step function:
- Function ID: `research-company`, event: `research/company.start`
- Concurrency: 5 simultaneous company pipelines
- Retries: 2 at the Inngest level
- Each phase is an Inngest `step.run()` (memoized — won't re-run on retry)
- Each agent call is wrapped in `runAgentStep()` which:
  - Updates the step status to "running" in Supabase
  - Runs the agent function
  - Updates status to "completed" with output, or "failed" with error
  - Records duration_ms
- Progress updates (0-100%) are written to `research_jobs.progress` after each agent

### Real-time Progress

- Frontend subscribes to Supabase Realtime on `research_jobs` and `research_steps` tables
- The research progress page (`/projects/[projectId]/research/[jobId]`) refetches job data on any change
- The project detail page also subscribes for live updates to the company list and active jobs
- The progress sidebar subscribes globally for all active jobs

### Environment Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Auth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=
ALLOWED_DOMAINS=@techolution.com
ALLOWED_EMAILS=                          # optional comma-separated whitelist

# Claude via Azure AI Foundry
AZURE_AI_FOUNDRY_ENDPOINT=               # base URL, no path suffix
AZURE_AI_FOUNDRY_API_KEY=

# Inngest
INNGEST_DEV=1                            # local dev mode only, remove for production
```

### Key Implementation Notes

1. **Auth proxy**: Next.js 16 uses `proxy.ts` not `middleware.ts`. Exclude `/api/auth`, `/api/inngest`, `/login`, and static assets.

2. **CSV upload**: Parse with `xlsx` library. Support both CSV and Excel. Extract company names from the first column.

3. **Supabase clients**: Two clients — `createServerClient()` uses service_role key (for API routes and agents), `createBrowserClient()` uses anon key (for Realtime subscriptions in the browser).

4. **Agent instruction files**: Read at runtime with `readFileSync(join(process.cwd(), "src/instructions/{agent}.md"))`. The system prompt has a `{{DATE}}` placeholder replaced with today's date.

5. **No web search**: Claude doesn't have live web search (unlike Gemini with Google Search grounding). Agents rely on training data. This makes anti-hallucination rules critical — agents will fabricate URLs if not explicitly told not to.

6. **Verification is the quality gate**: The verification agent is the most complex. It does HTTP requests to check URLs, fetches pages to verify stakeholder names, calls Claude for cross-reference checking, and scores overall quality. It auto-corrects score math, rating mismatches, and gemini status. It removes dead source URLs from all sections (not just the top-level sources array).

7. **Each agent outputs JSON matching TypeScript interfaces**: The Claude client has a robust JSON parser that handles raw JSON, ```json fenced blocks, and JSON embedded in prose.

8. **Inngest + Vercel**: Install the Inngest Vercel integration for production. Locally, run `npx inngest-cli@latest dev` alongside `npm run dev`.

### Build Order

1. Scaffold Next.js + Tailwind + TypeScript
2. Set up Supabase (run migration, create clients)
3. Auth (NextAuth + Google OAuth + proxy)
4. Types file (CompanyDetail and all interfaces)
5. Claude client (with retry + JSON parsing)
6. Layout (nav + sidebar + main area)
7. Project CRUD pages + API routes
8. CSV upload
9. Inngest setup + orchestrator
10. All 10 agents with instruction files (start with company_profile, test end-to-end, then add rest)
11. Research progress page (4-phase view with live data)
12. Company profile display page (5-tab view)
13. Verification agent (5-layer)
14. Progress sidebar (Supabase Realtime)
15. Polish (loading states, error states, empty states, retry)
