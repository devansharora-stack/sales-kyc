import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, stakeholderProfiles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { DeepStakeholderProfile, StakeholderIntelBrief } from "@/lib/types";

// Mark a `needs_confirmation` stakeholder as completed with ONLY basic info
// (name, title, company) when the person has no LinkedIn profile. This stops
// the app from repeatedly asking for a URL.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, session.user.email));
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [existing] = await db
    .select({ name: stakeholderProfiles.name, company: stakeholderProfiles.company, title: stakeholderProfiles.title })
    .from(stakeholderProfiles)
    .where(and(eq(stakeholderProfiles.id, id), eq(stakeholderProfiles.userId, user.id)));

  if (!existing) return NextResponse.json({ error: "Stakeholder not found" }, { status: 404 });

  const intelBrief: StakeholderIntelBrief = {
    intelQuality: "LOW",
    intelQualityReason: "No LinkedIn profile available — basic info only.",
    executiveSummary: "",
    keyInsight: "",
    careerNarrative: [],
    verifiedPriorities: [],
    painPoints: [],
    postInsights: [],
    engagementApproach: { openingAngle: "", talkingPoints: [], avoidTopics: [] },
  };

  const profile: DeepStakeholderProfile = {
    fullName: existing.name,
    headline: existing.title ?? undefined,
    experience: [],
    skills: [],
    education: [],
    certifications: [],
    organizations: [],
    languages: [],
    honorsAndAwards: [],
    volunteering: [],
    posts: [],
    companyIntel: { companyName: existing.company ?? undefined },
    intelBrief,
    dataRichness: {
      score: 0,
      about: false,
      experience: false,
      skills: false,
      posts: false,
      certifications: false,
      companyData: false,
      organizations: false,
    },
  };

  const [row] = await db
    .update(stakeholderProfiles)
    .set({
      status: "completed",
      progress: 100,
      errorMessage: null,
      data: { profile },
      updatedAt: new Date(),
    })
    .where(and(eq(stakeholderProfiles.id, id), eq(stakeholderProfiles.userId, user.id)))
    .returning();

  if (!row) return NextResponse.json({ error: "Stakeholder not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}
