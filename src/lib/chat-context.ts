import { createServerClient } from "@/lib/db";
import type { CompanyDetail } from "@/lib/types";

export async function buildChatSystemPrompt(context: {
  type: "company" | "project";
  projectId: string;
  companySlug?: string;
}): Promise<string> {
  const supabase = createServerClient();

  if (context.type === "company" && context.companySlug) {
    const { data: profile } = await supabase
      .from("company_profiles")
      .select("data")
      .eq("project_id", context.projectId)
      .eq("slug", context.companySlug)
      .single();

    if (!profile?.data) {
      return "You are a sales intelligence assistant. No company data is available for this profile.";
    }

    const company = cleanCompanyData(profile.data as CompanyDetail);

    return `You are a sales intelligence assistant for Techolution's sales team. You have complete access to the following researched company data. Use this data to answer questions accurately and specifically. Always reference specific data points from the research when answering.

If the user asks something not covered by the research data, clearly say so rather than guessing.

When drafting emails or messages, use the stakeholder names, pain points, and solution mappings from the research to make them specific and personalized.

## Company Research Data

${JSON.stringify(company, null, 2)}`;
  }

  const { data: profiles } = await supabase
    .from("company_profiles")
    .select("slug, total_score, rating, industry, urgency, primary_solution, gemini_status, data->name, data->fullName, data->hqCity, data->state, data->execSummary")
    .eq("project_id", context.projectId)
    .order("total_score", { ascending: false });

  if (!profiles?.length) {
    return "You are a sales intelligence assistant. No companies have been researched in this project yet.";
  }

  return `You are a sales intelligence assistant for Techolution's sales team. You have access to research summaries for ${profiles.length} companies in this project. Use this data to answer comparative questions and help prioritize accounts.

## Researched Companies

${JSON.stringify(profiles, null, 2)}`;
}

function cleanCompanyData(data: CompanyDetail): Partial<CompanyDetail> {
  const {
    slug: _slug,
    generatedDate: _generatedDate,
    lastUpdated: _lastUpdated,
    relatedCompanies: _relatedCompanies,
    sources: _topLevelSources,
    ...clean
  } = data;

  if (clean.solutionMappings) {
    clean.solutionMappings = clean.solutionMappings.map((m) => {
      const { solution: _id, fitScoreBreakdown: _breakdown, ...rest } = m;
      return rest as typeof m;
    });
  }

  return clean;
}
