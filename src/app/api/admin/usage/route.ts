import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { llmUsage, projects, companyProfiles, users, researchJobs, stakeholderProfiles } from "@/db/schema";
import { and, gte, lt, sql, eq, inArray, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { estimateCostUsd } from "@/lib/pricing";

// Business-facing lenses only. Internal mechanics (agent, phase, model) are not
// group options — model still shows as its own standalone table below.
type Group = "company" | "stakeholder" | "user" | "project";
const VALID_GROUPS: Group[] = ["company", "stakeholder", "user", "project"];

const LOCAL = "Local development"; // untagged / no-attribution usage = local/test.

const csv = (v: string | null) =>
  (v || "").split(",").map((s) => s.trim()).filter(Boolean);

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const groupParam = (searchParams.get("groupBy") || "company") as Group;
  const group: Group = VALID_GROUPS.includes(groupParam) ? groupParam : "company";

  const allTime = searchParams.get("allTime") === "1";
  const fromDay = (searchParams.get("from") || "").slice(0, 10);
  const toDay = (searchParams.get("to") || "").slice(0, 10);
  const userList = csv(searchParams.get("users"));
  const companyList = csv(searchParams.get("companies"));

  // Second users alias for the project's owner (llm_usage.userId already joins users).
  const projectOwner = alias(users, "project_owner");

  // The fallback label MUST be inlined as raw SQL text (not `${LOCAL}`, which
  // drizzle turns into a bind param). A param renders with different indices in
  // SELECT vs GROUP BY, so Postgres treats them as different expressions and
  // rejects the GROUP BY. LOCAL is a fixed constant, so raw-inlining is safe.
  const L = sql.raw(`'${LOCAL}'`);
  const GROUP_LABEL: Record<Group, ReturnType<typeof sql>> = {
    user: sql`coalesce(${users.email}, ${L})`,
    // company identity = display name (consistent with jobs/stakeholders/activity).
    company: sql`coalesce(${companyProfiles.data}->>'name', ${researchJobs.companyName}, ${L})`,
    // stakeholder = the analyzed person.
    stakeholder: sql`coalesce(${stakeholderProfiles.name}, ${L})`,
    project: sql`case when ${projects.name} is not null then ${projects.name} || coalesce(' · ' || ${projectOwner.email}, '') else ${L} end`,
  };

  // ET day-bucket expression — timezone inlined (not a bind param) so SELECT and
  // GROUP BY render identically (Postgres rejects a param mismatch there).
  const etDay = sql<string>`to_char((${llmUsage.createdAt} AT TIME ZONE 'America/New_York'), 'YYYY-MM-DD')`;

  const conds: SQL[] = [];
  if (!allTime && fromDay) conds.push(gte(llmUsage.createdAt, sql`(${fromDay}::timestamp AT TIME ZONE 'America/New_York')`));
  if (!allTime && toDay) conds.push(lt(llmUsage.createdAt, sql`((${toDay}::date + 1)::timestamp AT TIME ZONE 'America/New_York')`));
  if (userList.length) conds.push(inArray(users.email, userList));
  if (companyList.length) {
    conds.push(
      sql`coalesce(${companyProfiles.data}->>'name', ${researchJobs.companyName}) in (${sql.join(companyList.map((c) => sql`${c}`), sql`, `)})`
    );
  }
  // Company view = research spend only (exclude the stakeholder deep-analysis
  // phase); Stakeholders view = only that phase. Keeps the two lenses clean.
  if (group === "company") conds.push(sql`${llmUsage.phase} is distinct from 'stakeholder'`);
  if (group === "stakeholder") conds.push(sql`${llmUsage.phase} = 'stakeholder'`);
  const where: SQL = conds.length ? (and(...conds) as SQL) : sql`true`;

  const rows = await db
    .select({
      label: GROUP_LABEL[group].as("label"),
      model: llmUsage.model,
      inputTokens: sql<number>`sum(${llmUsage.inputTokens})::int`,
      outputTokens: sql<number>`sum(${llmUsage.outputTokens})::int`,
      lastActivity: sql<string>`max(${llmUsage.createdAt})`.as("last_activity"),
      // Which user(s) drove this row — "who researched/analyzed it".
      who: sql<string>`string_agg(distinct coalesce(${users.email}, ${L}), ', ')`,
    })
    .from(llmUsage)
    .leftJoin(researchJobs, eq(llmUsage.jobId, researchJobs.id))
    .leftJoin(companyProfiles, eq(llmUsage.companyProfileId, companyProfiles.id))
    .leftJoin(stakeholderProfiles, eq(llmUsage.stakeholderId, stakeholderProfiles.id))
    .leftJoin(projects, eq(llmUsage.projectId, projects.id))
    .leftJoin(projectOwner, eq(projects.userId, projectOwner.id))
    .leftJoin(users, eq(llmUsage.userId, users.id))
    .where(where)
    .groupBy(GROUP_LABEL[group], llmUsage.model);

  const byLabel = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number; lastActivity: string | null; who: Set<string> }>();
  const byModel = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number }>();
  let totalIn = 0;
  let totalOut = 0;
  let totalCost = 0;

  for (const r of rows) {
    const cost = estimateCostUsd(r.model, r.inputTokens, r.outputTokens);
    const label = String(r.label ?? LOCAL);
    const l = byLabel.get(label) || { inputTokens: 0, outputTokens: 0, costUsd: 0, lastActivity: null, who: new Set<string>() };
    l.inputTokens += r.inputTokens;
    l.outputTokens += r.outputTokens;
    l.costUsd += cost;
    if (r.lastActivity && (!l.lastActivity || r.lastActivity > l.lastActivity)) l.lastActivity = r.lastActivity;
    for (const email of String(r.who ?? "").split(", ").filter(Boolean)) l.who.add(email);
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

  // Daily time series (ET) — scoped to the same filters/phase as the breakdown.
  const daily = await db
    .select({
      day: etDay.as("day"),
      model: llmUsage.model,
      inputTokens: sql<number>`sum(${llmUsage.inputTokens})::int`,
      outputTokens: sql<number>`sum(${llmUsage.outputTokens})::int`,
    })
    .from(llmUsage)
    .leftJoin(researchJobs, eq(llmUsage.jobId, researchJobs.id))
    .leftJoin(companyProfiles, eq(llmUsage.companyProfileId, companyProfiles.id))
    .leftJoin(users, eq(llmUsage.userId, users.id))
    .where(where)
    .groupBy(etDay, llmUsage.model);

  const seriesMap = new Map<string, { day: string; tokens: number; costUsd: number }>();
  for (const d of daily) {
    const s = seriesMap.get(d.day) || { day: d.day, tokens: 0, costUsd: 0 };
    s.tokens += d.inputTokens + d.outputTokens;
    s.costUsd += estimateCostUsd(d.model, d.inputTokens, d.outputTokens);
    seriesMap.set(d.day, s);
  }

  const breakdown = [...byLabel.entries()]
    .map(([label, v]) => {
      const { who, ...rest } = v;
      return { label, ...rest, tokens: v.inputTokens + v.outputTokens, who: [...who].join(", ") };
    })
    .sort((a, b) => b.costUsd - a.costUsd);

  const models = [...byModel.entries()]
    .map(([model, v]) => ({ model, ...v, tokens: v.inputTokens + v.outputTokens }))
    .sort((a, b) => b.costUsd - a.costUsd);

  const series = [...seriesMap.values()].sort((a, b) => a.day.localeCompare(b.day));

  const [userOpts, companyOpts] = await Promise.all([
    db.select({ id: users.id, email: users.email }).from(users).orderBy(users.email),
    db
      .selectDistinct({ slug: companyProfiles.slug, name: sql<string>`coalesce(${companyProfiles.data}->>'name', ${companyProfiles.slug})` })
      .from(companyProfiles),
  ]);

  return NextResponse.json({
    groupBy: group,
    allTime,
    from: fromDay || null,
    to: toDay || null,
    totals: { inputTokens: totalIn, outputTokens: totalOut, tokens: totalIn + totalOut, costUsd: totalCost },
    breakdown,
    models,
    series,
    options: {
      users: userOpts,
      companies: companyOpts.sort((a, b) => a.name.localeCompare(b.name)),
    },
  });
}
