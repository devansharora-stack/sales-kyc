/**
 * Company Disambiguator — cheap pre-research lookup.
 *
 * A bare company name (e.g. "MedVision Solutions") can match many real, distinct
 * companies. Before spending a full research run guessing, this returns a short
 * list of candidate companies (name + official domain + industry + HQ + a one-
 * liner) so the user can pick the exact one; the chosen domain then anchors the
 * real research pipeline.
 */

import { callGeminiGrounded } from "@/lib/gemini";
import { cleanDomain } from "@/lib/company-match";

export interface CompanyCandidate {
  name: string;
  domain: string; // root domain, no protocol/path
  industry: string;
  hq: string; // "City, ST" or "City, Country"
  descriptor: string; // one short line
}

export async function findCompanyCandidates(name: string): Promise<CompanyCandidate[]> {
  const { data } = await callGeminiGrounded<CompanyCandidate[]>({
    systemPrompt:
      "You are a company disambiguation assistant. Given a company name that may match multiple real, distinct companies, you find the most likely candidates using web search so a user can pick the right one. Only return REAL companies you can verify, each with its official website domain.",
    userPrompt: `Multiple different companies may share the name "${name}". Using web search, find up to 6 REAL, DISTINCT companies that go by this name (or a very close variant).

For each company return:
- name: the company's proper name
- domain: its official website root domain only (e.g. "medvisionsolutions.net") — no protocol, no path, no www
- industry: short industry / sector
- hq: headquarters as "City, State" (US) or "City, Country"
- descriptor: one short line on what they do

Rank by prominence / likelihood. Only include a company if you can identify its official website. If the name really is unambiguous (only one real company), return just that one.

Respond ONLY with a JSON array: [{"name","domain","industry","hq","descriptor"}]`,
  });

  const seen = new Set<string>();
  const out: CompanyCandidate[] = [];
  for (const c of Array.isArray(data) ? data : []) {
    const domain = cleanDomain(c?.domain || "");
    const nm = (c?.name || "").trim();
    if (!nm || !domain || seen.has(domain)) continue;
    seen.add(domain);
    out.push({
      name: nm,
      domain,
      industry: (c?.industry || "").trim(),
      hq: (c?.hq || "").trim(),
      descriptor: (c?.descriptor || "").trim(),
    });
    if (out.length >= 6) break;
  }
  return out;
}
