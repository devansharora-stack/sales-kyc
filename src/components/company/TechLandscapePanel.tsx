"use client";

import type { Source, TechLandscape } from "@/lib/types";
import Sources from "./Sources";

function VendorRow({ item }: { item: string }) {
  const [name, ...rest] = item.split(/\s*[—–-]\s*/);
  const desc = rest.join(" — ");
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-slate-100 dark:border-slate-700 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{name}</p>
        {desc && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p>}
      </div>
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 shrink-0 uppercase tracking-wide">Active</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
      <p className="text-label">{label}</p>
      <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{value}</p>
    </div>
  );
}

export default function TechLandscapePanel({ tech }: { tech: TechLandscape }) {
  const vendors = tech.knownVendors?.value
    ? (Array.isArray(tech.knownVendors.value) ? tech.knownVendors.value : [tech.knownVendors.value])
    : [];
  const systems = tech.knownSystems?.value
    ? (Array.isArray(tech.knownSystems.value) ? tech.knownSystems.value : [tech.knownSystems.value])
    : [];
  const allVendorItems = [...vendors, ...systems];

  const cloud = tech.cloudProviders?.value
    ? (Array.isArray(tech.cloudProviders.value) ? tech.cloudProviders.value.join(", ") : String(tech.cloudProviders.value))
    : "Unknown";
  const workspace = typeof tech.workspacePlatform?.value === "string" ? tech.workspacePlatform.value : "Unknown";
  const ai = tech.knownAIDeployments?.value
    ? (Array.isArray(tech.knownAIDeployments.value) ? tech.knownAIDeployments.value : [String(tech.knownAIDeployments.value)])
    : [];

  const allSources: Source[] = [
    ...(tech.cloudProviders?.sources || []),
    ...(tech.workspacePlatform?.sources || []),
    ...(tech.knownAIDeployments?.sources || []),
    ...(tech.knownVendors?.sources || []),
    ...(tech.knownSystems?.sources || []),
  ];
  const seenUrls = new Set<string>();
  const dedupedSources = allSources.filter(s => { if (seenUrls.has(s.url)) return false; seenUrls.add(s.url); return true; });

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Current Vendors & Systems</p>
        </div>
        <div className="px-4 max-h-[360px] overflow-y-auto">
          {allVendorItems.length > 0
            ? allVendorItems.map((item, i) => <VendorRow key={i} item={item} />)
            : <p className="text-sm text-slate-400 dark:text-slate-500 py-3">No vendor data available</p>
          }
        </div>
      </div>

      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Cloud & Technology</p>
        </div>
        <div className="px-4">
          <InfoRow label="Cloud Provider" value={cloud} />
          <InfoRow label="Workspace" value={workspace} />
          {ai.length > 0 && (
            <div className="py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
              <p className="text-label">AI Deployments</p>
              <div className="mt-1.5 space-y-1">
                {ai.map((a, i) => {
                  const [name, ...rest] = a.split(/\s*[—–-]\s*/);
                  return (
                    <div key={i} className="text-sm text-slate-700 dark:text-slate-300">
                      <span className="font-medium">{name}</span>
                      {rest.length > 0 && <span className="text-slate-500 dark:text-slate-400"> — {rest.join(" — ")}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {dedupedSources.length > 0 && (
        <div className="md:col-span-2">
          <Sources sources={dedupedSources} />
        </div>
      )}
    </div>
  );
}
