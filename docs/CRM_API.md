# CRM Persona-Advisor API (v1)

Machine-to-machine API for the Techolution CRM to pull KYC research and per-contact
meeting prep. No user session — routes under `/api/crm/*` are exempt from the
NextAuth middleware and gate on a shared API key instead. Entirely additive: new
routes + two helper libs, no schema changes.

## Auth

Every request must send the key:

```
x-api-key: <CRM_API_KEY>
```

(`Authorization: Bearer <key>` also accepted.) Missing/wrong key → `401`. Key not
set on the server → `503 not_configured`.

## Environment

| Var | Purpose | Default |
|-----|---------|---------|
| `CRM_API_KEY` | Shared secret the CRM sends as `x-api-key`. **Required.** | — |
| `CRM_SYSTEM_EMAIL` | Owner email for the auto-created system project that hosts CRM-triggered research. | `crm-system@techolution.com` |

CRM-triggered research is quarantined in a get-or-created project **"CRM Advisor
(system)"** owned by the system user, so it never pollutes a real user's project.

## Endpoints

### `POST /api/crm/v1/lookup`
Resolve a company (and optionally a contact) from existing research. On a miss,
kicks the research pipeline and returns a job to poll.

Body:
```json
{
  "company": "Darling Ingredients",   // company OR domain required
  "domain": "darlingii.com",
  "contactName": "Bob Day",            // optional
  "linkedinUrl": "https://linkedin.com/in/…",  // optional
  "autoResearch": true                 // default true; false = 404 on miss
}
```

Responses:
- **Ready** — `{ "status": "ready", "matchType": "domain", "company": {profileId, projectId, slug, name}, "stakeholder": {…}|null, "links": {…} }`
- **Researching** — `{ "status": "researching", "jobId": "…", "poll": "/api/crm/v1/status?jobId=…" }` (reuses an in-flight job for the same company; `reused: true`)
- **Not found** (only when `autoResearch:false`) — `404 { "status": "not_found" }`

### `GET /api/crm/v1/company?slug=|company=|domain=[&projectId=]`
Full researched `CompanyDetail` JSON.
`{ "status": "ready", "profileId", "slug", "geminiStatus", "updatedAt", "company": {…full profile…} }`
`404 not_found` if not researched.

### `GET /api/crm/v1/prep?contact=(slug|company|domain)[&linkedinUrl=&projectId=]`
Per-contact meeting prep, assembled deterministically from stored research (no LLM):
```json
{
  "status": "ready",          // "partial" when the contact isn't deep-researched
  "company": { "slug": "…", "name": "…" },
  "contactMatched": { "matchType": "linkedin" },
  "prep": {
    "person": { "name", "title", "tier", "researched" },
    "persona": { "executiveSummary", "keyInsight", "careerNarrative", "verifiedPriorities", "painPoints" },
    "engagement": { "openingAngle", "talkingPoints", "avoidTopics" },
    "companyContext": { "name", "execSummary", "topPainPoints", "entrySolution" },
    "recommendedSolutions": [ … ],   // person-specific via the offering matrix, else company primary/secondary
    "scripts": { "offeringName", "predictedTone", "leaveBehind", "tones" }
  }
}
```
`persona`/`engagement` are `null` when the person hasn't been deep-researched yet;
`companyContext` + `recommendedSolutions` still return (`status: "partial"`).

### `GET /api/crm/v1/status?jobId=`
Poll a research job from `/lookup`.
`{ "job": {status, progress, research_steps[]}, "profileSlug": "…"|null, "done": bool }`

## Typical flow

1. `POST /lookup` with the CRM contact's company + name.
2. If `researching`, poll `GET /status?jobId=…` until `done`.
3. `GET /prep?slug=…&contact=…` for the meeting brief (or `GET /company` for the full profile).

## Notes / v1 scope

- Prep is **deterministic assembly** of existing research. An LLM-tailored variant
  can be added behind a flag later without changing the response shape.
- Matching reuses the app's dedup logic (domain → exact → fuzzy for companies;
  LinkedIn → name+company for people).
- Single shared key. If per-consumer keys/revocation are needed later, swap
  `requireCrmKey` for a hashed-keys table — routes stay unchanged.
