import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "@/lib/db";
import { llmUsage } from "@/db/schema";

// Attribution attached to every LLM call within a scope. All fields optional —
// a call outside any scope still records tokens, just without attribution.
export interface UsageContext {
  projectId?: string | null;
  companyProfileId?: string | null;
  stakeholderId?: string | null;
  userId?: string | null;
  jobId?: string | null;
  agent?: string | null;
  phase?: string | null;
}

const storage = new AsyncLocalStorage<UsageContext>();

// Run `fn` with the given attribution context so any LLM call inside it (however
// deep) is tagged. Nested scopes merge onto the parent.
export function runWithUsageContext<T>(ctx: UsageContext, fn: () => T): T {
  const parent = storage.getStore() || {};
  return storage.run({ ...parent, ...ctx }, fn);
}

export function getUsageContext(): UsageContext {
  return storage.getStore() || {};
}

interface RecordUsageInput {
  provider: "claude" | "gemini" | "luna";
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

// Best-effort: telemetry must never break or slow the LLM path. Fire-and-forget
// insert; swallow all errors.
export function recordLlmUsage(u: RecordUsageInput): void {
  const ctx = getUsageContext();
  const input = Math.max(0, Math.round(u.inputTokens ?? 0));
  const output = Math.max(0, Math.round(u.outputTokens ?? 0));
  if (input === 0 && output === 0) return;

  void db
    .insert(llmUsage)
    .values({
      provider: u.provider,
      model: u.model,
      inputTokens: input,
      outputTokens: output,
      projectId: ctx.projectId ?? null,
      companyProfileId: ctx.companyProfileId ?? null,
      stakeholderId: ctx.stakeholderId ?? null,
      userId: ctx.userId ?? null,
      jobId: ctx.jobId ?? null,
      agent: ctx.agent ?? null,
      phase: ctx.phase ?? null,
    })
    .catch((e) => {
      console.log(`[usage] failed to record: ${e instanceof Error ? e.message : e}`);
    });
}
