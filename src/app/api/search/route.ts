import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, projects, companyProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { canonicalName, levenshtein } from "@/lib/company-match";
import type { CompanyDetail, Rating } from "@/lib/types";

/**
 * Structured fuzzy search over the user's projects + companies.
 * Reuses the pure matchers in company-match.ts (canonicalName/levenshtein) —
 * NOT the chat helpers, which return markdown. Powers the projects-page search
 * box and the "add existing company" picker.
 */
function fuzzyScore(query: string, target: string): number {
  const q = canonicalName(query);
  const t = canonicalName(target);
  if (!q || !t) return 0;
  if (t.includes(q) || q.includes(t)) return 1;
  const dist = levenshtein(q, t);
  const maxLen = Math.max(q.length, t.length);
  const sim = maxLen === 0 ? 0 : 1 - dist / maxLen;
  // token overlap bonus
  const qTokens = new Set(q.split(" ").filter(Boolean));
  const tTokens = t.split(" ").filter(Boolean);
  const overlap = tTokens.filter((tok) => qTokens.has(tok)).length;
  const tokenBonus = overlap > 0 ? 0.3 : 0;
  return Math.min(1, sim + tokenBonus);
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ projects: [], companies: [] });

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, session.user.email));
  if (!user) return NextResponse.json({ projects: [], companies: [] });

  const [projectRows, companyRows] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name, status: projects.status, companyCount: projects.companyCount })
      .from(projects)
      .where(eq(projects.userId, user.id)),
    db
      .select({
        slug: companyProfiles.slug,
        projectId: companyProfiles.projectId,
        totalScore: companyProfiles.totalScore,
        rating: companyProfiles.rating,
        industry: companyProfiles.industry,
        data: companyProfiles.data,
      })
      .from(companyProfiles)
      .where(eq(companyProfiles.userId, user.id)),
  ]);

  const projectName = new Map(projectRows.map((p) => [p.id, p.name]));

  const THRESHOLD = 0.4;

  const matchedProjects = projectRows
    .map((p) => ({ p, score: fuzzyScore(q, p.name) }))
    .filter((x) => x.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ p }) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      company_count: p.companyCount,
    }));

  const matchedCompanies = companyRows
    .map((c) => {
      const d = (c.data || {}) as Partial<CompanyDetail>;
      const name = d.name || c.slug;
      const score = Math.max(fuzzyScore(q, name), (c.industry ? fuzzyScore(q, c.industry) : 0) * 0.6);
      return { c, d, name, score };
    })
    .filter((x) => x.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ c, name }) => ({
      name,
      slug: c.slug,
      projectId: c.projectId,
      projectName: c.projectId ? projectName.get(c.projectId) || null : null,
      totalScore: c.totalScore,
      rating: (c.rating as Rating) || null,
      industry: c.industry || null,
    }));

  return NextResponse.json({ projects: matchedProjects, companies: matchedCompanies });
}
