@AGENTS.md

# Sales KYC — AI-Powered Company Research Platform

## What This Is
Self-service sales intelligence tool for Techolution. Users upload company lists, a 10-agent AI pipeline researches each company automatically, and results appear in a real-time dashboard with scores, GTM strategies, and stakeholder intel. Output must be **sales-ready** — reps act on this data without manual verification.

## Tech Stack
- **Frontend**: Next.js 16 + TypeScript + Tailwind v4
- **Database**: Supabase (PostgreSQL + Realtime for live progress)
- **AI (all agents)**: Claude Opus 4.6 via Azure AI Foundry
- **Background Jobs**: Inngest v4 (serverless step functions with retries)
- **Auth**: NextAuth.js v4 + Google OAuth (restricted to @techolution.com)
- **Future**: Gemini 2.5 Flash with Google Search grounding for Phase 1-2 research agents (when GCP billing is enabled). Gemini provides live web search; Claude does not.

## Project Structure
```
src/
  app/                       # Next.js pages and API routes
    api/
      auth/[...nextauth]/    # Google OAuth (NextAuth)
      projects/              # Project CRUD + company add (triggers Inngest)
        [projectId]/
          route.ts           # GET, PATCH, DELETE project
          companies/route.ts # GET companies, POST to add + trigger research
      research/[jobId]/      # Job status + step details
      upload/                # CSV/Excel upload parser
      inngest/               # Inngest serve endpoint (POST + GET)
    projects/
      [projectId]/
        page.tsx             # Project detail: company table, progress, retry, archive
        company/[slug]/
          page.tsx           # Full company profile: 5-tab view (Overview, Intelligence, GTM, Stakeholders, Sources)
      new/page.tsx           # New project: CSV upload + manual entry
    page.tsx                 # Dashboard: project list + stats
    login/page.tsx           # Google sign-in
  agents/                    # 10 AI agent functions + orchestrator
    orchestrator.ts          # Inngest step function coordinating 4-phase pipeline
    company-profile.ts       # Phase 1: basic company info
    tech-stack.ts            # Phase 1: technology landscape
    financial-signal.ts      # Phase 1: budget/investment signals
    trigger-scanner.ts       # Phase 2: recent trigger events
    pain-point-analyzer.ts   # Phase 2: pain points mapped to solutions
    stakeholder-researcher.ts # Phase 2: key decision makers
    solution-mapper.ts       # Phase 3: Techolution solution mappings
    gtm-generator.ts         # Phase 3: go-to-market strategy
    scoring-agent.ts         # Phase 3: 5-dimension 100-point scoring
    verification-agent.ts    # Phase 4: strict validation + URL checking + cross-reference
  components/
    company/                 # Display: RatingBadge, ScoreBar, Sources, TechLandscape, etc.
    layout/                  # Navigation, MainLayout
    ProgressSidebar.tsx      # Supabase Realtime subscription for live agent progress
    SessionProvider.tsx
  instructions/              # System prompts for each agent (markdown files)
    system-prompt.md         # Base context prepended to ALL agents
    company-profile.md       # Agent-specific instructions (one per agent)
    ...
    verification-agent.md
    README.md                # How to edit/test instruction files
  lib/
    types.ts                 # CompanyDetail + all types (canonical data contract)
    db.ts                    # Supabase client (server: service_role, browser: anon)
    claude.ts                # Azure AI Foundry client: callClaude(), callClaudeJSON()
    gemini.ts                # Google AI SDK client (unused while on Claude-only)
    inngest.ts               # Inngest client instance
    auth.ts                  # NextAuth config (Google OAuth, domain restriction)
  proxy.ts                   # Next.js 16 auth proxy (NOT middleware.ts)
supabase/
  migrations/
    001_initial_schema.sql   # Tables: users, projects, research_jobs, research_steps, company_profiles
```

## Agent Pipeline

### Architecture
All 10 agents call Claude Opus via Azure AI Foundry (`src/lib/claude.ts`). Each agent reads its instruction file from `src/instructions/` at runtime. The base `system-prompt.md` is prepended to every agent — it contains Techolution's solution portfolio, scoring rubric, and citation rules.

### Flow
```
User uploads companies
  → POST /api/projects/[id]/companies
    → Creates research_job + 10 research_steps in Supabase
    → Sends Inngest event "research/company.start"

Inngest orchestrator (src/agents/orchestrator.ts):
  ┌─ Phase 1: Foundation (sequential within step, 3 agents)
  │  ├── Company Profile → basic info, revenue, HQ, description
  │  ├── Tech Stack → cloud, workspace, AI deployments, vendors
  │  └── Financial Signal → budget evidence, investment signals
  │
  ├─ Phase 2: Intelligence (sequential within step, 3 agents)
  │  ├── Trigger Scanner → recent events across 8 categories
  │  ├── Pain Point Analyzer → challenges mapped to Techolution solutions
  │  └── Stakeholder Researcher → decision makers with tiers
  │
  ├─ Phase 3: Synthesis (3 separate Inngest steps, sequential)
  │  ├── Solution Mapper → detailed solution-to-pain-point mappings
  │  ├── GTM Generator → full go-to-market strategy
  │  └── Scoring Agent → 5-dimension 100-point scoring
  │
  └─ Phase 4: Verification (1 step)
     └── Verification Agent → URL checking, structural validation,
         stakeholder verification, cross-reference consistency,
         LLM content quality review, auto-corrections
         → Saves corrected CompanyDetail to company_profiles table
```

### Agent Details

| # | Agent | File | Input | Output | Key Behavior |
|---|-------|------|-------|--------|-------------|
| 1 | Company Profile | `company-profile.ts` | Company name, optional context | slug, name, HQ, revenue, employees, description, execSummary | Must cite revenue/employee sources |
| 2 | Tech Stack | `tech-stack.ts` | Company name | TechLandscape (cloud, workspace, AI, vendors, systems) | Workspace platform is critical for Gemini scoring |
| 3 | Financial Signal | `financial-signal.ts` | Company name | Budget evidence, investment signals, AI job count | Exports `FinancialSignalOutput` type used by downstream |
| 4 | Trigger Scanner | `trigger-scanner.ts` | Company name + profile context | TriggerEvent[] (8 categories) | Focus on last 12 months, 5-8 triggers |
| 5 | Pain Point Analyzer | `pain-point-analyzer.ts` | Profile + triggers + tech + financial | PainPoint[] with severity + solution IDs | Maps every pain point to Techolution solutions |
| 6 | Stakeholder Researcher | `stakeholder-researcher.ts` | Company name | Stakeholder[] with tier + source URL | MUST NOT fabricate names — return fewer rather than guess |
| 7 | Solution Mapper | `solution-mapper.ts` | Profile + pain points + tech + triggers | SolutionMapping[] with priority + proof points | 1-2 Primary, 1-3 Secondary, 0-2 Tertiary |
| 8 | GTM Generator | `gtm-generator.ts` | All prior outputs | GTMStrategy (brief, entry, pilot, expand, urgency) | Entry strategy names specific stakeholders |
| 9 | Scoring Agent | `scoring-agent.ts` | All prior outputs | ScoreBreakdown (5 dimensions, 100 points) | Strict rubric, conservative when ambiguous |
| 10 | Verification | `verification-agent.ts` | Complete assembled profile | Verified/corrected profile | See "Verification" section below |

### Verification Agent (Critical)

The verification agent is the quality gate. It runs 5 layers of checks:

1. **Structural validation (TypeScript)**: Score math, rating alignment, dimension ranges, required arrays, gemini status logic
2. **Source URL verification (HTTP)**: HEAD/GET request to every source URL. Removes 404s and connection failures. Keeps 403s (paywalled but real).
3. **Stakeholder verification (HTTP)**: Fetches each stakeholder's sourceUrl, checks if their name appears on the page. Removes unverifiable stakeholders.
4. **Cross-reference consistency (LLM)**: Detects contradictions (e.g., different CTO names in different sections). Returns corrections to apply.
5. **Content quality scoring (LLM)**: Checks specificity, quality, and flags generic/fabricated content.

Auto-corrections applied: score math, rating, gemini status, dead URLs removed, unverifiable stakeholders removed, cross-reference fixes.

### Instruction Files

Each agent has a markdown instruction file in `src/instructions/`:
- `system-prompt.md` — **Prepended to ALL agents**. Contains: Techolution overview, 8 solutions, scoring rubric, citation rules, anti-hallucination rules, output format.
- `{agent-name}.md` — Agent-specific instructions with: what to research, search strategy, output schema, rules.

To modify agent behavior, edit the instruction `.md` file — no code changes needed. The instruction is read at runtime via `readFileSync`.

### Adding a New Agent
1. Create `src/instructions/new-agent.md` with search strategy + output schema
2. Create `src/agents/new-agent.ts` — import `callClaudeJSON`, read instruction files, export async function
3. Add to orchestrator pipeline in appropriate phase
4. Add agent_name to the `agentSteps` array in `POST /api/projects/[id]/companies`
5. Update verification agent if new output needs validation

## Key Technical Details

### Claude Client (`src/lib/claude.ts`)
- Endpoint: Azure AI Foundry at `AZURE_AI_FOUNDRY_ENDPOINT/anthropic/v1/messages`
- Model: `claude-opus-4-6` (configurable via `ANTHROPIC_DEFAULT_OPUS_MODEL`)
- Retry: 4 attempts with 10s/20s/30s backoff on 429, 503, 529 errors
- JSON parsing: Handles raw JSON, ```json fenced blocks, and JSON embedded in prose
- Temperature: 0.2 for all agents (deterministic output)

### Inngest Orchestrator (`src/agents/orchestrator.ts`)
- Function ID: `research-company`, event: `research/company.start`
- Concurrency: 5 simultaneous company pipelines
- Retries: 2 (Inngest-level function retries)
- Each phase is an Inngest step (memoized — won't re-run on retry)
- Progress updates written to Supabase after each agent completes (0-100%)

### Supabase Realtime
- Frontend subscribes to `research_jobs` and `research_steps` tables
- `ProgressSidebar.tsx` shows live per-agent status (pending/running/done/error)
- Project detail page auto-refreshes on database changes

### Auth (`src/proxy.ts`)
- Next.js 16 uses `proxy.ts` not `middleware.ts`
- Excludes: `/api/auth`, `/api/inngest`, `/login`, static assets
- Domain restriction via `ALLOWED_DOMAINS` env var

## Data Contract

`src/lib/types.ts` is the canonical schema. Key interfaces:
- `CompanyDetail` — full company profile (what gets saved to `company_profiles.data`)
- `ScoreBreakdown` — 5-dimension scores with reasoning and sources
- `TriggerEvent`, `PainPoint`, `SolutionMapping`, `Stakeholder`, `GTMStrategy`
- `Source` — every claim must have label, url, date, type
- `SolutionId` — one of 8 Techolution solutions (type-safe IDs)

## Environment Variables
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Auth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=...
ALLOWED_DOMAINS=@techolution.com
ALLOWED_EMAILS=                          # comma-separated whitelist (optional)

# Claude via Azure AI Foundry
AZURE_AI_FOUNDRY_ENDPOINT=...            # Base URL (no /anthropic/v1/messages)
AZURE_AI_FOUNDRY_API_KEY=...

# Gemini (optional — not currently used, for future GCP billing)
GEMINI_API_KEY=...

# Inngest
INNGEST_DEV=1                            # Set for local dev mode
```

## Dev Commands
```bash
npm run dev                    # Start Next.js dev server (port 3000)
npx inngest-cli@latest dev     # Start Inngest dev server (port 8288) — needed for agent pipeline
npx tsc --noEmit               # Type check
```

Both servers must be running for the agent pipeline to work. Inngest dev server provides the local event queue and step execution.

## Quality Standards

This tool produces data that sales reps act on directly. Every output must be:
- **Accurate**: No fabricated stakeholder names, URLs, or financial figures
- **Sourced**: Every claim has a real, verifiable source URL
- **Consistent**: No contradictions between sections (e.g., same CTO name everywhere)
- **Current**: Focused on last 12 months of data
- **Actionable**: GTM strategy names real people and specific pain points

The verification agent is the enforcement layer. It removes anything it can't verify and flags quality concerns. When in doubt, it strips data rather than presenting unverified claims.
