# Agent Instructions

Each `.md` file in this directory is a system prompt for one of the 10 research agents.

## Files

| File | Agent | Model | Phase |
|------|-------|-------|-------|
| `system-prompt.md` | Base context (prepended to all) | — | — |
| `company-profile.md` | Company Profile | Gemini Pro | 1 |
| `tech-stack.md` | Tech Stack | Gemini Pro | 1 |
| `financial-signal.md` | Financial Signal | Gemini Pro | 1 |
| `trigger-scanner.md` | Trigger Scanner | Gemini Pro | 2 |
| `pain-point-analyzer.md` | Pain Point Analyzer | Gemini Pro | 2 |
| `stakeholder-researcher.md` | Stakeholder Researcher | Gemini Pro | 2 |
| `solution-mapper.md` | Solution Mapper | Claude Opus | 3 |
| `gtm-generator.md` | GTM Generator | Claude Opus | 3 |
| `scoring-agent.md` | Scoring Agent | Claude Opus | 3 |
| `verification-agent.md` | Verification Agent | Gemini Flash | 4 |

## How It Works

1. `system-prompt.md` provides base context (Techolution solutions, scoring rubric, citation rules)
2. Each agent file defines: what to research, search strategy, output JSON schema, rules
3. Agent code in `src/agents/*.ts` reads these files at runtime and passes them to the LLM
4. The `{{DATE}}` placeholder in system-prompt.md is replaced with today's date

## Editing Tips

- Keep output schemas in sync with `src/lib/types.ts`
- Test changes by running a single company through the pipeline
- Each agent's output feeds into later agents — check dependencies before changing schemas
