// TEMPORARY local-only preview: renders the real StakeholderProfileView from a
// scraped JSON file on disk, bypassing the (currently unreachable) database.
// Visit /preview/stakeholder?name=john-rainey  (file = scripts/out-<name>.json)
// Safe to delete once DB access is restored.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import StakeholderProfileView from "@/components/StakeholderProfileView";
import type { DeepStakeholderProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

function listProfiles(): string[] {
  try {
    return readdirSync(join(process.cwd(), "scripts"))
      .filter((f) => f.startsWith("out-") && f.endsWith(".json"))
      .map((f) => f.replace(/^out-/, "").replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

export default async function StakeholderPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string }>;
}) {
  const available = listProfiles();
  const { name } = await searchParams;
  const target = name || available[0];

  let profile: DeepStakeholderProfile | null = null;
  let error: string | null = null;
  try {
    if (!target) throw new Error("No scraped profiles found in scripts/out-*.json");
    profile = JSON.parse(readFileSync(join(process.cwd(), "scripts", `out-${target}.json`), "utf8"));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] py-8 px-4">
      <div className="max-w-6xl mx-auto mb-4 flex items-center gap-2 flex-wrap text-xs">
        <span className="text-slate-400">Preview (from disk, no DB):</span>
        {available.map((n) => (
          <Link
            key={n}
            href={`/preview/stakeholder?name=${n}`}
            className={`px-2.5 py-1 rounded-full border ${
              n === target
                ? "bg-[#3289FF] text-white border-[#3289FF]"
                : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
            }`}
          >
            {n}
          </Link>
        ))}
      </div>
      {error ? (
        <div className="max-w-6xl mx-auto card p-8 text-center text-sm text-red-500">{error}</div>
      ) : profile ? (
        <StakeholderProfileView p={profile} />
      ) : null}
    </div>
  );
}
