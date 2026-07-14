/**
 * Deep Stakeholder Analysis orchestrator (Inngest fn `analyzeStakeholder`).
 *
 * Mirrors the company orchestrator's status pattern, writing status/progress to
 * the stakeholder_profiles row as it advances:
 *   queued → resolving → scraping → synthesizing → completed
 *            (→ needs_confirmation if URL can't be confidently resolved)
 *            (→ failed if no usable data from any provider)
 *
 * Scraping (validated Phase 0): Apify harvest profile = backbone (experience/
 * skills/about), Apify apimaestro = full posts, Bright Data = supplementary
 * (about/certs/honors/company). All best-effort; merged into one normalized
 * DeepStakeholderProfile, then Claude synthesizes the intelBrief.
 */

import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { stakeholderProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveLinkedInUrl } from "./linkedin-url-resolver";
import { scrapeHarvestProfile, scrapeApifyPosts } from "@/lib/apify";
import { scrapeBrightDataProfile } from "@/lib/brightdata";
import { synthesizeStakeholder } from "./stakeholder-synthesizer";
import { rebuildStakeholderOfferingMatrix } from "@/lib/rebuild-matrix";
import { runWithUsageContext } from "@/lib/usage-context";
import type {
  DeepStakeholderProfile,
  StakeholderStatus,
  StakeholderExperience,
  StakeholderEducation,
  StakeholderCertification,
  StakeholderOrganization,
  StakeholderAward,
  StakeholderVolunteering,
  StakeholderPost,
  StakeholderDataRichness,
} from "@/lib/types";

type Row = typeof stakeholderProfiles.$inferSelect;

export async function updateStakeholderStatus(
  id: string,
  update: Partial<typeof stakeholderProfiles.$inferInsert>,
) {
  await db
    .update(stakeholderProfiles)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(stakeholderProfiles.id, id));
}

export const analyzeStakeholder = inngest.createFunction(
  {
    id: "analyze-stakeholder",
    retries: 0,
    concurrency: [{ limit: 3 }],
    triggers: [{ event: "research/stakeholder.start" }],
  },
  async ({ event, step }: { event: { data: { stakeholderId: string } }; step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const { stakeholderId } = event.data;

    const [row] = await db.select().from(stakeholderProfiles).where(eq(stakeholderProfiles.id, stakeholderId));
    if (!row) throw new Error(`Stakeholder ${stakeholderId} not found`);

    try {
      // ── 1. Resolve LinkedIn URL (skip if already confirmed/provided) ──
      let url = row.linkedinUrl || null;
      let confidence = (row.urlConfidence as "high" | "low" | "confirmed" | null) || null;

      if (!url || confidence === "low") {
        await step.run("status-resolving", () =>
          updateStakeholderStatus(stakeholderId, { status: "resolving", progress: 10 }),
        );
        const resolved = await step.run("resolve-url", () =>
          resolveLinkedInUrl(row.name, row.company || undefined, row.title || undefined),
        );
        // Not actually at this company (left the role, or never worked here —
        // e.g. a customer reference mistaken for an exec). Remove the row
        // outright so it never surfaces in the stakeholders tab; re-adding the
        // person later triggers a fresh analysis.
        if (resolved.departed) {
          await db.delete(stakeholderProfiles).where(eq(stakeholderProfiles.id, stakeholderId));
          return { status: "departed", stakeholderId, deleted: true };
        }
        if (!resolved.url || resolved.confidence === "low") {
          await updateStakeholderStatus(stakeholderId, {
            status: "needs_confirmation",
            progress: 10,
            linkedinUrl: resolved.url || row.linkedinUrl,
            urlConfidence: "low",
            errorMessage:
              "Could not confidently resolve this person's LinkedIn profile. Paste their LinkedIn URL to continue.",
          });
          return { status: "needs_confirmation", stakeholderId };
        }
        url = resolved.url;
        confidence = "high";
        await step.run("status-url-resolved", () =>
          updateStakeholderStatus(stakeholderId, { linkedinUrl: url, urlConfidence: "high" }),
        );
      }

      const linkedinUrl = url!;

      // ── 2. Scrape all three providers (best-effort) ──
      await step.run("status-scraping", () =>
        updateStakeholderStatus(stakeholderId, { status: "scraping", progress: 35 }),
      );
      const { bright, profile, posts } = await step.run("scrape", async () => {
        const [b, p, po] = await Promise.allSettled([
          scrapeBrightDataProfile(linkedinUrl),
          scrapeHarvestProfile(linkedinUrl),
          scrapeApifyPosts(linkedinUrl),
        ]);
        return {
          bright: b.status === "fulfilled" ? b.value : null,
          profile: p.status === "fulfilled" ? p.value : null,
          posts: po.status === "fulfilled" ? po.value : [],
        };
      });

      if (!profile && !bright && (!posts || posts.length === 0)) {
        throw new Error("No usable data returned from any provider for this profile.");
      }

      // ── 3. Merge + normalize ──
      const raw = mergeProfile({ bright, profile, posts, linkedinUrl, fallbackName: row.name, fallbackCompany: row.company });

      // ── 4. Synthesize the intel brief ──
      await step.run("status-synthesizing", () =>
        updateStakeholderStatus(stakeholderId, { status: "synthesizing", progress: 70 }),
      );
      const intelBrief = await step.run("synthesize", () =>
        runWithUsageContext(
          { projectId: row.projectId, userId: row.userId, companyProfileId: row.companyProfileId, agent: "stakeholder_deep", phase: "stakeholder" },
          () => synthesizeStakeholder(raw),
        ),
      );

      const full: DeepStakeholderProfile = { ...raw, intelBrief, dataRichness: computeRichness(raw) };

      // ── 5. Save ──
      await step.run("save", async () => {
        await updateStakeholderStatus(stakeholderId, {
          status: "completed",
          progress: 100,
          errorMessage: null,
          title: full.headline || row.title,
          data: { raw: { bright, profile, posts } as Record<string, unknown>, profile: full },
        });
      });

      // ── 6. Refresh the company's Stakeholder × Offering matrix with this
      // person's verified intel. Best-effort — never fail the run over it.
      if (row.companyProfileId) {
        await step.run("rebuild-matrix", async () => {
          try {
            await runWithUsageContext(
              { projectId: row.projectId, userId: row.userId, companyProfileId: row.companyProfileId, agent: "stakeholder_matrix_rebuild", phase: "stakeholder" },
              () => rebuildStakeholderOfferingMatrix(row.companyProfileId!),
            );
          } catch (e) {
            console.log(`[stakeholder] matrix rebuild failed: ${e instanceof Error ? e.message : e}`);
          }
          return null;
        });
      }

      return { status: "completed", stakeholderId };
    } catch (error) {
      await updateStakeholderStatus(stakeholderId, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
);

// ─── Merge + normalize ───────────────────────────────────────────────────────
// Tolerant extractors: scraper field names vary, so try common variants and
// accept either strings or objects.

const str = (...vals: unknown[]): string | undefined => {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
};
const num = (...vals: unknown[]): number | undefined => {
  for (const v of vals) {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
      if (!isNaN(n)) return n;
    }
  }
  return undefined;
};
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export function mergeProfile(input: {
  bright: Record<string, any> | null;
  profile: Record<string, any> | null;
  posts: Record<string, any>[];
  linkedinUrl: string;
  fallbackName: string;
  fallbackCompany: string | null;
}): Omit<DeepStakeholderProfile, "intelBrief" | "dataRichness"> {
  const a = input.profile || {}; // Apify harvest — backbone
  const b = input.bright || {}; // Bright Data — supplementary

  const fullName =
    str(a.fullName, a.name, [a.firstName, a.lastName].filter(Boolean).join(" "), b.name, b.full_name, input.fallbackName) ||
    input.fallbackName;

  // Experience — Apify primary (Bright Data experience is unreliable).
  const experience: StakeholderExperience[] = arr(a.experience).map((e: any) => ({
    position: str(e.position, e.title, e.jobTitle, e.role) || "",
    company: str(e.companyName, e.company, e.organisation, e.organization) || "",
    startDate: str(e.startDate, e.start_date, e.starts_at, e.period),
    endDate: str(e.endDate, e.end_date, e.ends_at),
    duration: str(e.duration, e.durationText, e.length),
    location: str(e.location),
    description: str(e.description, e.summary),
  })).filter((e) => e.position || e.company);

  const education: StakeholderEducation[] = (arr(a.education).length ? arr(a.education) : arr(b.education)).map((e: any) => ({
    school: str(e.schoolName, e.school, e.title, e.institution) || "",
    degree: str(e.degree, e.degreeName),
    fieldOfStudy: str(e.fieldOfStudy, e.field, e.subtitle),
  })).filter((e) => e.school);

  const certsSrc = arr(a.certifications).length ? arr(a.certifications) : arr(b.certifications);
  const certifications: StakeholderCertification[] = certsSrc.map((c: any) => ({
    title: str(c.title, c.name, c.subtitle) || (typeof c === "string" ? c : "") || "",
    issuer: str(c.issuer, c.authority, c.organization),
  })).filter((c) => c.title);

  const orgsSrc = arr(a.organizations).length ? arr(a.organizations) : arr(b.organizations);
  const organizations: StakeholderOrganization[] = orgsSrc.map((o: any) => ({
    title: str(o.title, o.name, o.organization) || (typeof o === "string" ? o : "") || "",
    role: str(o.role, o.position),
  })).filter((o) => o.title);

  const awardsSrc = arr(a.honorsAndAwards).length ? arr(a.honorsAndAwards) : arr(b.honors_and_awards);
  const honorsAndAwards: StakeholderAward[] = awardsSrc.map((h: any) => ({
    title: str(h.title, h.name) || (typeof h === "string" ? h : "") || "",
    issuer: str(h.issuer, h.publication, h.description),
  })).filter((h) => h.title);

  const volSrc = arr(a.volunteering).length ? arr(a.volunteering) : arr(b.volunteer_experience);
  const volunteering: StakeholderVolunteering[] = volSrc.map((v: any) => ({
    role: str(v.role, v.title, v.position) || "",
    organization: str(v.organization, v.companyName, v.subtitle),
  })).filter((v) => v.role || v.organization);

  const skills: string[] = (arr(a.skills).length ? arr(a.skills) : arr(b.skills))
    .map((s: any) => (typeof s === "string" ? s : str(s.name, s.title, s.skill)))
    .filter((s): s is string => !!s);

  const languages: string[] = (arr(a.languages).length ? arr(a.languages) : arr(b.languages))
    .map((l: any) => (typeof l === "string" ? l : str(l.name, l.language, l.title)))
    .filter((l): l is string => !!l);

  // Posts — apimaestro shape. Pre-filter to substantive ones.
  const posts: StakeholderPost[] = input.posts
    .map((p: any) => ({
      text: str(p.text, p.content, p.postText) || "",
      date: str(p.postedAt, p.date, p.posted_at, p.time, p.postedDate),
      likes: num(p.numLikes, p.likes, p.likesCount, p.reactions, p.totalReactionCount),
      comments: num(p.numComments, p.comments, p.commentsCount, p.numComments),
      url: str(p.url, p.postUrl, p.link, p.shareUrl),
    }))
    .filter((p) => p.text)
    .filter((p) => isSubstantivePost(p));

  const companyName = str(b.current_company?.name, b.company, experience[0]?.company, input.fallbackCompany || undefined);
  const companyIntel = companyName
    ? {
        companyName,
        industry: str(b.current_company?.industry, b.industry),
        employeeCount: str(b.current_company?.company_size, b.company_size),
        revenue: str(b.current_company?.revenue),
        yearFounded: str(b.current_company?.founded),
        specialities: arr(b.current_company?.specialties).map((s: any) => String(s)).filter(Boolean),
      }
    : undefined;

  return {
    fullName,
    firstName: str(a.firstName, b.first_name),
    lastName: str(a.lastName, b.last_name),
    headline: str(a.headline, a.occupation, b.position, b.headline),
    photoUrl: str(a.photo, a.photoUrl, a.profilePicture, a.profilePic, b.avatar, b.profile_pic_url),
    linkedinUrl: input.linkedinUrl,
    location: str(a.location?.linkedinText, a.location, a.locationName, b.city, b.location),
    about: str(a.about, a.summary, b.about, b.summary),
    experience,
    skills,
    education,
    certifications,
    organizations,
    languages,
    honorsAndAwards,
    volunteering,
    connectionsCount: num(a.connectionsCount, a.connections, b.connections),
    followerCount: num(a.followersCount, a.followerCount, a.followers, b.followers),
    posts,
    companyIntel,
  };
}

// Personal / ceremonial posts that carry no sales signal. Cheap mechanical
// screen so we don't spend synthesis tokens just to have Claude discard them.
const PERSONAL_POST_PATTERNS = [
  /\bhappy (?:birthday|anniversary)\b/i,
  /\bwork ?anniversary\b/i,
  /\b\d+ years? at\b/i,
  /\b(?:thrilled|honou?red|humbled|delighted|proud) to (?:announce|share|receive)\b/i,
  /\bcongratulations?\b/i,
  /\bcongrats\b/i,
  /\bRIP\b|\brest in peace\b/i,
  /\bthank you (?:all|everyone|so much)\b/i,
];

// Drop obvious low-signal posts before synthesis (mirror webinar-intel pre-filter):
// keep posts with some engagement OR enough text to carry an opinion, and drop
// personal/ceremonial posts that reveal nothing about how the person thinks.
function isSubstantivePost(p: StakeholderPost): boolean {
  const text = (p.text || "").trim();
  const len = text.length;
  const engagement = (p.likes || 0) + (p.comments || 0);
  if (len < 80) return false;
  // Short-to-medium personal posts are noise; very long posts may still carry a
  // real take, so only screen patterns out below the 280-char "opinion" bar.
  if (len < 280 && PERSONAL_POST_PATTERNS.some((re) => re.test(text))) return false;
  return engagement > 0 || len > 200;
}

export function computeRichness(p: Omit<DeepStakeholderProfile, "intelBrief" | "dataRichness">): StakeholderDataRichness {
  const flags = {
    about: !!(p.about && p.about.length > 20),
    experience: p.experience.length > 0,
    skills: p.skills.length > 0,
    posts: p.posts.length > 0,
    certifications: p.certifications.length > 0,
    companyData: !!p.companyIntel,
    organizations: p.organizations.length > 0,
  };
  const present = Object.values(flags).filter(Boolean).length;
  const score = Math.round((present / Object.keys(flags).length) * 100);
  return { score, ...flags };
}

export type { Row as StakeholderRow };
