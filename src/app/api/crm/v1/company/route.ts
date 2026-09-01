import { NextResponse, type NextRequest } from "next/server";
import { requireCrmKey } from "@/lib/crm-auth";
import { resolveCompany, resolveCompanyBySlug } from "@/lib/crm-resolve";
import { cleanDomain } from "@/lib/company-match";

/**
 * GET /api/crm/v1/company?slug=|company=|domain=  [&projectId=]
 * Returns the full researched CompanyDetail profile as JSON. 404 if none.
 */
export async function GET(request: NextRequest) {
  const denied = requireCrmKey(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug")?.trim();
  const company = searchParams.get("company")?.trim();
  const domain = searchParams.get("domain")?.trim();
  const projectId = searchParams.get("projectId")?.trim() || undefined;

  let row = null;
  let matchType: string | null = "exact";
  if (slug) {
    row = await resolveCompanyBySlug(slug, projectId);
  } else if (company || domain) {
    const hit = await resolveCompany(company || undefined, domain ? cleanDomain(domain) : undefined);
    if (hit) {
      row = hit.row;
      matchType = hit.matchType;
    }
  } else {
    return NextResponse.json({ error: "Provide 'slug', 'company', or 'domain'" }, { status: 400 });
  }

  if (!row) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    status: "ready",
    matchType,
    profileId: row.id,
    projectId: row.projectId,
    slug: row.slug,
    geminiStatus: row.geminiStatus,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    company: row.data,
  });
}
