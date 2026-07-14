import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { llmUsage, projects, companyProfiles, users, researchJobs } from "@/db/schema";
import { and, gte, lte, sql, eq } from "drizzle-orm";
import { estimateCostUsd } from "@/lib/pricing";

type Group = "company" | "project" | "user" | "model" | "agent" | "phase";

// Column to group by. "company" resolves via job → company_profiles (research
// usage has no companyProfileId until the profile exists) and the direct column.
const GROUP_LABEL: Record<Group, ReturnType<typeof sql>> = {
  model: sql`${llmUsage.model}`,
  agent: sql`coalesce(${llmUsage.agent}, 'unknown')`,
  phase: sql`coalesce(${llmUsage.phase}, 'unknown')`,
  project: sql`coalesce(${projects.name}, 'unknown')`,
  user: sql`coalesce(${users.email}, 'unknown')`,
  company: sql`coalesce(${companyProfiles.slug}, ${researchJobs.companyName}, 'unknown')`,
};

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const groupBy = (searchParams.get("groupBy") || "company") as Group;
  const group = GROUP_LABEL[groupBy] ? groupBy : "company";

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : new Date(Date.now() - 30 * 86400000);
  const to = toParam ? new Date(toParam) : new Date();

  const where = and(gte(llmUsage.createdAt, from), lte(llmUsage.createdAt, to));

  // Base query joins the lookups needed for human-readable group labels.
  const base = db
    .select({
      label: GROUP_LABEL[group].as("label"),
      model: llmUsage.model,
      inputTokens: sql<number>`sum(${llmUsage.inputTokens})::int`,
      outputTokens: sql<number>`sum(${llmUsage.outputTokens})::int`,
    })
    .from(llmUsage)
    .leftJoin(researchJobs, eq(llmUsage.jobId, researchJobs.id))
    .leftJoin(companyProfiles, eq(llmUsage.companyProfileId, companyProfiles.id))
    .leftJoin(projects, eq(llmUsage.projectId, projects.id))
    .leftJoin(users, eq(llmUsage.userId, users.id))
    .where(where);

  // Breakdown by the chosen group + model (so cost can be computed per model).
  const rows = await base.groupBy(GROUP_LABEL[group], llmUsage.model);

  // Aggregate into { label -> {input, output, cost} } and overall totals.
  const byLabel = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number }>();
  const byModel = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number }>();
  let totalIn = 0;
  let totalOut = 0;
  let totalCost = 0;

  for (const r of rows) {
    const cost = estimateCostUsd(r.model, r.inputTokens, r.outputTokens);
    const label = String(r.label ?? "unknown");
    const l = byLabel.get(label) || { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    l.inputTokens += r.inputTokens;
    l.outputTokens += r.outputTokens;
    l.costUsd += cost;
    byLabel.set(label, l);

    const m = byModel.get(r.model) || { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    m.inputTokens += r.inputTokens;
    m.outputTokens += r.outputTokens;
    m.costUsd += cost;
    byModel.set(r.model, m);

    totalIn += r.inputTokens;
    totalOut += r.outputTokens;
    totalCost += cost;
  }

  // Daily time series (tokens + cost per day) for a sparkline.
  const daily = await db
    .select({
      day: sql<string>`to_char(${llmUsage.createdAt}, 'YYYY-MM-DD')`.as("day"),
      model: llmUsage.model,
      inputTokens: sql<number>`sum(${llmUsage.inputTokens})::int`,
      outputTokens: sql<number>`sum(${llmUsage.outputTokens})::int`,
    })
    .from(llmUsage)
    .where(where)
    .groupBy(sql`to_char(${llmUsage.createdAt}, 'YYYY-MM-DD')`, llmUsage.model);

  const seriesMap = new Map<string, { day: string; tokens: number; costUsd: number }>();
  for (const d of daily) {
    const s = seriesMap.get(d.day) || { day: d.day, tokens: 0, costUsd: 0 };
    s.tokens += d.inputTokens + d.outputTokens;
    s.costUsd += estimateCostUsd(d.model, d.inputTokens, d.outputTokens);
    seriesMap.set(d.day, s);
  }

  const breakdown = [...byLabel.entries()]
    .map(([label, v]) => ({ label, ...v, tokens: v.inputTokens + v.outputTokens }))
    .sort((a, b) => b.costUsd - a.costUsd);

  const models = [...byModel.entries()]
    .map(([model, v]) => ({ model, ...v, tokens: v.inputTokens + v.outputTokens }))
    .sort((a, b) => b.costUsd - a.costUsd);

  const series = [...seriesMap.values()].sort((a, b) => a.day.localeCompare(b.day));

  return NextResponse.json({
    groupBy: group,
    from: from.toISOString(),
    to: to.toISOString(),
    totals: { inputTokens: totalIn, outputTokens: totalOut, tokens: totalIn + totalOut, costUsd: totalCost },
    breakdown,
    models,
    series,
  });
}
