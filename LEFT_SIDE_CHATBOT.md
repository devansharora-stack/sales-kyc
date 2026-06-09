# Left-Side Chatbot — Implementation Guide

**Feature:** AI chat assistant with full context of researched company data
**Developer:** Intern
**Timeline:** 4 days
**Dependencies:** None — uses only existing data already in Supabase

---

## What It Does

A collapsible chat panel on the right side of the dashboard. When a user is viewing a company profile, they can open the chat and ask questions. The chatbot has the **full company research data** as context — everything visible on the dashboard is available to the AI.

**Example questions a user would ask:**
- "What's the best entry point for this company?"
- "Draft a cold email to their CTO about Value Finder"
- "Summarize the pain points in 3 bullets for my meeting tomorrow"
- "What's the biggest risk of this engagement?"
- "Which solution fits their tech stack best?"
- "Compare their AI maturity to what we typically see"

**At the project level** (when not viewing a specific company):
- "Which company scored highest?"
- "Show me all companies using Google Workspace"
- "Which accounts have critical pain points?"

---

## Two Context Modes

| Mode | When active | What data the chatbot has |
|------|------------|---------------------------|
| **Company mode** | User is on a company profile page (`/projects/{id}/company/{slug}`) | Full CompanyDetail JSON for that company — profile, scores, stakeholders, pain points, tech stack, triggers, GTM strategy, solution mappings, sources |
| **Project mode** | User is on the project page (`/projects/{id}`) | Summaries of ALL companies in the project — names, scores, ratings, industries, key pain points |

The mode is determined automatically based on the current page URL.

---

## How It Works

```
User types a message in the chat panel
        │
        ▼
Frontend sends POST /api/chat:
  {
    message: "What's the best entry point?",
    sessionId: "abc-123" (or null for new conversation),
    context: {
      type: "company",
      projectId: "proj-456",
      companySlug: "searce"
    }
  }
        │
        ▼
API route handles the request:
  1. Authenticate user (getServerSession)
  2. Load context data from Supabase:
     - Company mode → load full CompanyDetail from company_profiles table
     - Project mode → load all company summaries for the project
  3. Build system prompt with the data injected
  4. Get or create a chat_sessions row for persistence
  5. Append the user message to conversation history
  6. Call Claude (Azure AI Foundry) with streaming enabled
  7. Save updated messages to chat_sessions table
  8. Stream response tokens back to frontend via SSE
        │
        ▼
Frontend renders tokens progressively as they arrive
```

---

## Data the Chatbot Uses

All of this data **already exists** in Supabase. You don't need to create any new data — just read it.

The company research data is stored in the `company_profiles` table, in a JSONB column called `data`. This column contains the full `CompanyDetail` object. Here's what's inside:

| Section | Fields | Example use in chat |
|---------|--------|-------------------|
| Company identity | name, fullName, industry, subSector, hqCity, state | "Where is this company headquartered?" |
| Financials | revenue (with sources), employees (with sources) | "What's their revenue?" |
| Narrative | businessDescription, execSummary | "Give me a one-liner about this company" |
| Tech landscape | cloudProviders, workspacePlatform, knownAIDeployments, knownVendors | "Are they on GCP or AWS?" |
| Trigger events | event, date, category, impact, sources | "What's the most recent trigger?" |
| Pain points | title, severity, affectedFunctions, sources | "What are their critical pain points?" |
| Solution mappings | solution, solutionName, painPoint, priority, proofPoint, estimatedImpact | "Which solution should we lead with?" |
| GTM strategy | entrySolution, pilotStrategy, competitivePositioning, urgency | "What's our go-to-market approach?" |
| Stakeholders | name, title, tier, relevance, source, confidence | "Who's the decision maker?" |
| Scores | budgetSignal, solutionFit, triggerRecency, aiMaturity, geminiAlignment | "Why did this company score 72?" |
| Rating | totalScore, rating (A-F) | "Is this an A or B account?" |
| Sources | label, url, date, type | "Where did the revenue figure come from?" |

The `CompanyDetail` interface is defined in `src/lib/types.ts` — read this file to understand the full schema.

---

## Note on Stakeholder Analysis Feature

A separate stakeholder deep analysis feature is being built in parallel on a different branch. **This does not affect the chatbot in any way.** Here's why:

1. The chatbot reads whatever data exists in the `company_profiles.data` JSONB column
2. It dumps the entire JSON into Claude's context — it doesn't hardcode specific fields
3. Whatever is in the data, Claude can answer questions about

When the stakeholder deep analysis feature merges later, it adds a new `stakeholder_analyses` table with richer per-person profiles. At that point, a small addition to `chat-context.ts` (5-10 lines) loads that extra data and appends it to the context. The chatbot code itself doesn't need to change.

**Build the chatbot against the data that exists today. Don't wait for or plan around the stakeholder feature.**

---

## Architecture

### UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Navigation Bar                                                  │
├──────────┬────────────────────────────────┬─────────────────────┤
│          │                                │                     │
│ Progress │    Main Content                │   Chat Panel        │
│ Sidebar  │    (existing pages)            │   (new)             │
│          │                                │                     │
│          │                                │  ┌───────────────┐  │
│          │                                │  │ Past sessions  │  │
│          │                                │  │ Message list   │  │
│          │                                │  │ ...            │  │
│          │                                │  │ ...            │  │
│          │                                │  │               │  │
│          │                                │  ├───────────────┤  │
│          │                                │  │ [Type here  ➤]│  │
│          │                                │  └───────────────┘  │
│          │                                │                     │
├──────────┴────────────────────────────────┴─────────────────────┤
│  Chat toggle button (floating, bottom-right)                     │
└─────────────────────────────────────────────────────────────────┘
```

The chat panel is **collapsible** — a toggle button opens/closes it. When closed, the main content takes full width. When open, the panel appears on the right side (~350px wide).

### Current layout code (`src/components/MainLayout.tsx`)

```tsx
// This is what exists today:
<>
  <Navigation />
  <div className="flex">
    <ProgressSidebar />
    <main className="flex-1 max-w-[1200px] mx-auto px-6 lg:px-10 py-8">
      {children}
    </main>
  </div>
</>

// You add the ChatPanel:
<>
  <Navigation />
  <div className="flex">
    <ProgressSidebar />
    <main className="flex-1 max-w-[1200px] mx-auto px-6 lg:px-10 py-8">
      {children}
    </main>
    <ChatPanel />
  </div>
</>
```

---

## Files to Create

| # | File | Purpose |
|---|------|---------|
| 1 | `src/components/chat/ChatPanel.tsx` | Main chat panel — collapsible container, session list, message list |
| 2 | `src/components/chat/ChatMessage.tsx` | Individual message bubble (user vs assistant styling) |
| 3 | `src/components/chat/ChatInput.tsx` | Text input field with send button |
| 4 | `src/app/api/chat/route.ts` | API endpoint — POST for messages (streaming), GET for session list |
| 5 | `src/lib/chat-context.ts` | Builds the system prompt by loading data from Supabase |

## Files to Modify

| File | Change |
|------|--------|
| `src/components/MainLayout.tsx` | Import and render `<ChatPanel />` next to main content |

## Files to NOT Modify

These files are being modified on a separate branch. Do not touch them to avoid merge conflicts:

- `src/agents/*` — all agent files
- `src/lib/types.ts` — type definitions
- `src/app/projects/[projectId]/company/[slug]/page.tsx` — company profile page
- `src/agents/orchestrator.ts` — pipeline orchestrator

---

## Database

### New table: `chat_sessions`

Run this SQL in the Supabase SQL Editor:

```sql
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_slug TEXT,
  context_type TEXT NOT NULL CHECK (context_type IN ('company', 'project')),
  title TEXT,
  messages JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_project ON chat_sessions(project_id);
```

### How messages are stored

The `messages` column is a JSONB array. Each message looks like:

```json
[
  { "role": "user", "content": "What's the best entry point?", "timestamp": "2026-06-08T10:30:00Z" },
  { "role": "assistant", "content": "Based on the research, the best entry...", "timestamp": "2026-06-08T10:30:05Z" }
]
```

On each new message, load the existing array, append the new user message + assistant response, and save back.

### How to read company data

```typescript
import { createServerClient } from "@/lib/db";

// Load a single company's full data:
const supabase = createServerClient();
const { data: profile } = await supabase
  .from("company_profiles")
  .select("data")
  .eq("project_id", projectId)
  .eq("slug", companySlug)
  .single();

const companyData = profile?.data; // This is the full CompanyDetail JSON

// Load all companies in a project (for project-level chat):
const { data: profiles } = await supabase
  .from("company_profiles")
  .select("slug, total_score, rating, industry, data->name, data->execSummary")
  .eq("project_id", projectId);
```

---

## API Design

### POST /api/chat — Send a message (streaming response)

**Request body:**
```typescript
{
  message: string;           // The user's message
  sessionId?: string;        // Existing session ID, or omit for new conversation
  context: {
    type: "company" | "project";
    projectId: string;
    companySlug?: string;    // Required when type is "company"
  };
}
```

**Response:** Server-Sent Events (SSE) stream. Each event is a chunk of Claude's response.

**Logic:**
1. Authenticate user via `getServerSession(authOptions)` — see `src/lib/auth.ts`
2. If no `sessionId`, create a new `chat_sessions` row
3. Load context data from Supabase (company or project level)
4. Build system prompt (see Context Injection below)
5. Load existing messages from `chat_sessions.messages`
6. Append new user message
7. Call Claude via Azure AI Foundry with `stream: true`
8. Stream tokens back to frontend
9. After streaming completes, save the full assistant response to `chat_sessions.messages`

### GET /api/chat — List sessions

**Query params:** `projectId` (required), `companySlug` (optional)

**Response:**
```typescript
{
  sessions: {
    id: string;
    title: string;
    context_type: string;
    company_slug: string | null;
    updated_at: string;
    messageCount: number;
  }[]
}
```

---

## Context Injection (`src/lib/chat-context.ts`)

This is the core of the chatbot — it builds the system prompt that gives Claude all the research data.

```typescript
import { createServerClient } from "@/lib/db";

export async function buildChatSystemPrompt(context: {
  type: "company" | "project";
  projectId: string;
  companySlug?: string;
}): Promise<string> {
  const supabase = createServerClient();

  if (context.type === "company" && context.companySlug) {
    // Company mode: load full CompanyDetail
    const { data: profile } = await supabase
      .from("company_profiles")
      .select("data")
      .eq("project_id", context.projectId)
      .eq("slug", context.companySlug)
      .single();

    if (!profile?.data) {
      return "You are a sales intelligence assistant. No company data is available for this profile.";
    }

    return `You are a sales intelligence assistant for Techolution's sales team. You have complete access to the following researched company data. Use this data to answer questions accurately and specifically. Always reference specific data points from the research when answering.

If the user asks something not covered by the research data, clearly say so rather than guessing.

When drafting emails or messages, use the stakeholder names, pain points, and solution mappings from the research to make them specific and personalized.

## Company Research Data

${JSON.stringify(profile.data, null, 2)}`;
  }

  // Project mode: load summaries of all companies
  const { data: profiles } = await supabase
    .from("company_profiles")
    .select("slug, total_score, rating, industry, urgency, primary_solution, gemini_status, data->name, data->fullName, data->execSummary, data->hqCity, data->state")
    .eq("project_id", context.projectId)
    .order("total_score", { ascending: false });

  if (!profiles?.length) {
    return "You are a sales intelligence assistant. No companies have been researched in this project yet.";
  }

  return `You are a sales intelligence assistant for Techolution's sales team. You have access to research summaries for ${profiles.length} companies in this project. Use this data to answer comparative questions and help prioritize accounts.

## Researched Companies

${JSON.stringify(profiles, null, 2)}`;
}
```

---

## Calling Claude with Streaming

The existing Claude client is in `src/lib/claude.ts`. It uses Azure AI Foundry. For the chatbot, you need a **streaming** version. Create this helper:

```typescript
// In src/app/api/chat/route.ts or a separate helper

async function streamClaude(systemPrompt: string, messages: { role: string; content: string }[]): Promise<Response> {
  const endpoint = process.env.AZURE_AI_FOUNDRY_ENDPOINT + "/anthropic/v1/messages";
  const apiKey = process.env.AZURE_AI_FOUNDRY_API_KEY;
  const model = process.env.ANTHROPIC_DEFAULT_OPUS_MODEL || "claude-opus-4-6";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  return response; // response.body is a ReadableStream of SSE events
}
```

The API route then pipes this stream back to the frontend:

```typescript
// In the POST handler:
const claudeResponse = await streamClaude(systemPrompt, conversationMessages);

return new Response(claudeResponse.body, {
  headers: {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  },
});
```

---

## Frontend Streaming

On the frontend, read the SSE stream:

```typescript
const response = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message, sessionId, context }),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();
let fullResponse = "";

while (reader) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  // Parse SSE events from chunk
  // Each event has: data: {"type":"content_block_delta","delta":{"text":"..."}}
  // Extract the text deltas and append to the message being displayed
  const lines = chunk.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = line.slice(6);
      if (data === "[DONE]") break;
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "content_block_delta" && parsed.delta?.text) {
          fullResponse += parsed.delta.text;
          // Update the displayed message with fullResponse
        }
      } catch {}
    }
  }
}
```

---

## UI Component Details

### ChatPanel.tsx

- **Collapsed state:** A floating button (bottom-right corner) with a chat icon. Clicking it opens the panel.
- **Expanded state:** A ~350px wide panel on the right side. Contains:
  - Header with "Chat" title and close button
  - Session list dropdown (past conversations)
  - "New Chat" button
  - Message list (scrollable, auto-scrolls to bottom on new messages)
  - Input area at the bottom
- **Determine context automatically** from the current URL:
  - URL contains `/company/{slug}` → company mode, extract slug
  - URL is `/projects/{id}` → project mode
  - Use `usePathname()` and `useParams()` from Next.js

### ChatMessage.tsx

- User messages: right-aligned, blue background
- Assistant messages: left-aligned, gray background, supports markdown rendering
- Show timestamp on hover
- For assistant messages still streaming, show a blinking cursor at the end

### ChatInput.tsx

- Text input field (can be a textarea for multiline)
- Send button (or Enter to send, Shift+Enter for newline)
- Disabled while assistant is responding
- Placeholder text changes based on context: "Ask about {companyName}..." or "Ask about your companies..."

---

## Existing Code to Understand

Before starting, read these files to understand the patterns used in the project:

| File | Why |
|------|-----|
| `src/lib/db.ts` | How Supabase client is created (use `createServerClient()` in API routes) |
| `src/lib/auth.ts` | How authentication works (use `getServerSession(authOptions)` in API routes) |
| `src/lib/claude.ts` | How Claude is called via Azure AI Foundry (use same endpoint/key pattern) |
| `src/lib/types.ts` | All TypeScript interfaces — especially `CompanyDetail` |
| `src/components/MainLayout.tsx` | The layout you'll modify to add the chat panel |
| `src/components/ProgressSidebar.tsx` | Example of a side panel component in this codebase |
| `src/app/api/projects/[projectId]/companies/route.ts` | Example of an authenticated API route |

---

## Day-by-Day Plan

### Day 1: Streaming chat API

1. Create `chat_sessions` table in Supabase (run the SQL above)
2. Create `src/lib/chat-context.ts` — the context builder
3. Create `src/app/api/chat/route.ts` — POST (streaming) + GET (list sessions)
4. Test with curl or Postman — send a message, verify streaming works

### Day 2: Chat UI components

1. Create `src/components/chat/ChatMessage.tsx`
2. Create `src/components/chat/ChatInput.tsx`
3. Create `src/components/chat/ChatPanel.tsx` — wire up the components
4. Test as a standalone component (hardcode some messages first)

### Day 3: Context injection + integration

1. Wire `ChatPanel` into `MainLayout.tsx`
2. Implement auto-detection of context mode from URL
3. Test company mode: open a company profile, ask questions, verify answers use research data
4. Test project mode: open project page, ask comparative questions

### Day 4: Persistence + polish

1. Implement session persistence — save/load from `chat_sessions` table
2. Add session list (past conversations) to the panel
3. Add "New Chat" button
4. Polish: loading states, error handling, responsive design
5. Test: refresh page → verify chat history is still there

---

## Testing Checklist

- [ ] Open company profile → open chat → "What's the best entry point?" → answer uses actual research data
- [ ] "Draft an email to [stakeholder name]" → output is personalized with real data
- [ ] "What are the top pain points?" → lists actual pain points from the profile
- [ ] Refresh page → chat history still there
- [ ] Open project page → "Which company scored highest?" → correct answer
- [ ] Streaming works — tokens appear progressively, not all at once
- [ ] Collapse/expand panel doesn't break page layout
- [ ] Multiple sessions — can create new chat, switch between past ones
- [ ] Unauthenticated request returns 401
- [ ] No company data available → chatbot says so clearly instead of hallucinating
