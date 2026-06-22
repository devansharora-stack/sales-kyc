import type { DeepStakeholderProfile } from "@/lib/types";

function Section({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) {
  if (empty) return null;
  return (
    <div className="card p-6 mb-4">
      <h2 className="text-label mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-xs px-2 py-0.5 rounded border ${className}`}>{children}</span>;
}

function IntelQualityBadge({ quality }: { quality: string }) {
  const styles: Record<string, string> = {
    HIGH: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-slate-700",
    MEDIUM: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-slate-700",
    LOW: "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-slate-700",
  };
  return (
    <span className={`text-xs font-bold px-3 py-1.5 rounded ${styles[quality] || styles.LOW}`}>
      {quality} INTEL
    </span>
  );
}

function SourceLink({ url, label }: { url?: string; label: string }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="text-xs text-[#3289FF] hover:text-[#1C57FF] underline underline-offset-2">
      [{label}]
    </a>
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    HIGH: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    MEDIUM: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    LOW: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${styles[level] || styles.LOW}`}>{level}</span>;
}

export default function StakeholderProfileView({ p }: { p: DeepStakeholderProfile }) {
  const brief = p.intelBrief;
  const richness = p.dataRichness;
  const initials = (p.firstName?.[0] || p.fullName?.[0] || "?") + (p.lastName?.[0] || "");

  return (
    <div className="max-w-6xl mx-auto">
      {/* Profile Header */}
      <div className="card p-6 mb-4">
        <div className="flex items-start gap-5">
          {p.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photoUrl} alt="" className="w-20 h-20 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-2xl font-bold text-slate-400 dark:text-slate-500">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{p.fullName}</h1>
            {p.headline && <p className="text-slate-500 dark:text-slate-400 mt-1">{p.headline}</p>}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {brief?.intelQuality && <IntelQualityBadge quality={brief.intelQuality} />}
              {p.location && <Badge className="bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700">{p.location}</Badge>}
              {p.linkedinUrl && (
                <a href={p.linkedinUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-[#3289FF] hover:text-[#1C57FF] ml-2">LinkedIn &nearr;</a>
              )}
            </div>
          </div>
          {richness && (
            <div className="text-right shrink-0 text-sm">
              <div className="text-slate-400 dark:text-slate-500 text-xs">Intel Score</div>
              <div className="text-2xl font-bold text-[#3289FF]">{richness.score}<span className="text-sm text-slate-300 dark:text-slate-500">/100</span></div>
            </div>
          )}
        </div>

        {richness && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center gap-3 flex-wrap text-xs">
            <span className="text-slate-400 dark:text-slate-500">Intel coverage:</span>
            {([
              ["About", richness.about],
              ["Experience", richness.experience],
              ["Skills", richness.skills],
              ["Posts", richness.posts],
              ["Certs", richness.certifications],
              ["Company Data", richness.companyData],
              ["Orgs", richness.organizations],
            ] as [string, boolean][]).map(([label, has]) => (
              <span key={label} className={has ? "text-emerald-600 dark:text-emerald-400" : "text-slate-300 dark:text-slate-500"}>
                {has ? "✓" : "✗"} {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Intelligence Brief */}
      {brief && (brief.executiveSummary || brief.verifiedPriorities?.length > 0 || brief.painPoints?.length > 0) && (
        <div className="border border-[#3289FF]/20 rounded-lg mb-4 overflow-hidden bg-[#F8FAFF] dark:bg-slate-800/60">
          <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-blue-50/50 dark:from-blue-900/30 to-transparent">
            <div className="flex items-center gap-4">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Intelligence Brief</h2>
              <IntelQualityBadge quality={brief.intelQuality} />
            </div>
          </div>

          <div className="px-6 py-5 space-y-6">
            {brief.executiveSummary && <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{brief.executiveSummary}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {brief.verifiedPriorities?.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-4">Verified Priorities</h3>
                  <div className="space-y-4">
                    {brief.verifiedPriorities.map((vp, i) => (
                      <div key={i} className="border-l-[3px] border-emerald-300 pl-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{vp.priority}</span>
                          <ConfidenceBadge level={vp.confidence} />
                        </div>
                        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{vp.evidence}</p>
                        {vp.sourceUrl && <div className="mt-1"><SourceLink url={vp.sourceUrl} label="source" /></div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {brief.painPoints?.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600 mb-4">Pain Points</h3>
                  <div className="space-y-4">
                    {brief.painPoints.map((pp, i) => (
                      <div key={i} className="border-l-[3px] border-orange-300 pl-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{pp.pain}</span>
                          <ConfidenceBadge level={pp.confidence} />
                        </div>
                        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{pp.evidence}</p>
                        {pp.sourceUrl && <div className="mt-1"><SourceLink url={pp.sourceUrl} label="source" /></div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {brief.engagementApproach && (brief.engagementApproach.openingAngle || brief.engagementApproach.talkingPoints?.length > 0) && (
              <div className="pt-5 border-t border-slate-200 dark:border-slate-700">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#3289FF] mb-4">Engagement Approach</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    {brief.engagementApproach.openingAngle && (
                      <>
                        <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-1">Opening Angle</div>
                        <p className="text-sm text-slate-700 dark:text-slate-300">{brief.engagementApproach.openingAngle}</p>
                      </>
                    )}
                    {brief.engagementApproach.talkingPoints?.length > 0 && (
                      <div className="mt-4">
                        <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-1">Talking Points</div>
                        <ul className="space-y-1.5">
                          {brief.engagementApproach.talkingPoints.map((tp, i) => (
                            <li key={i} className="text-sm text-slate-600 dark:text-slate-300 flex gap-2">
                              <span className="text-[#3289FF] shrink-0 font-bold">&bull;</span>
                              {tp}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  {brief.engagementApproach.avoidTopics?.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-1">Avoid</div>
                      <ul className="space-y-1.5">
                        {brief.engagementApproach.avoidTopics.map((t, i) => (
                          <li key={i} className="text-sm text-red-600 flex gap-2">
                            <span className="shrink-0 font-bold">!</span>
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {brief.keyInsight && (
              <div className="p-4 rounded-lg bg-blue-50/50 dark:bg-blue-900/30 border border-[#3289FF]/10">
                <div className="text-xs font-bold uppercase tracking-wider text-[#3289FF] mb-2">Key Insight</div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{brief.keyInsight}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-4">
          <Section title="In Their Own Words" empty={!p.about}>
            <ul className="space-y-2">
              {(p.about || "").split(/(?:\n|\. (?=[A-Z]))/).filter((s) => s.trim().length > 10).map((sentence, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  <span className="text-[#3289FF] shrink-0 mt-0.5">&#8226;</span>
                  <span>{sentence.trim().replace(/\.$/, "")}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Professional DNA" empty={p.experience.length === 0}>
            <div className="space-y-0">
              {p.experience.map((exp, i) => {
                const narrative = brief?.careerNarrative?.[i];
                return (
                  <div key={i} className="relative pl-8 pb-4 last:pb-0">
                    {i < p.experience.length - 1 && (
                      <div className="absolute left-[9px] top-3 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />
                    )}
                    <div className={`absolute left-0 top-1.5 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center
                      ${i === 0 ? "border-[#3289FF] bg-blue-50 dark:bg-blue-900/30" : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"}`}>
                      {i === 0 && <div className="w-2 h-2 rounded-full bg-[#3289FF]" />}
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm leading-tight">{exp.position}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{exp.company}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {(exp.startDate || exp.endDate) && <div className="text-xs text-slate-400 dark:text-slate-500">{exp.startDate} — {exp.endDate}</div>}
                        {exp.duration && <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{exp.duration}</div>}
                      </div>
                    </div>
                    {exp.location && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{exp.location}</p>}
                    {narrative?.takeaway ? (
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed bg-slate-50 dark:bg-slate-800/60 rounded px-2 py-1.5 border-l-2 border-[#3289FF]/30">
                        {narrative.takeaway}
                      </p>
                    ) : exp.description ? (
                      <ul className="mt-1.5 space-y-1">
                        {exp.description.split(/(?:\n|(?:\. ))/).filter((s) => s.trim().length > 15).slice(0, 4).map((point, j) => (
                          <li key={j} className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed flex gap-1.5">
                            <span className="text-slate-300 dark:text-slate-500 shrink-0">&#8211;</span>
                            <span>{point.trim().replace(/\.$/, "")}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Section>

          {brief?.postInsights?.length > 0 ? (
            <Section title={`Key LinkedIn Insights (${brief.postInsights.length} curated)`}>
              <div className="space-y-3">
                {brief.postInsights.map((pi, i) => (
                  <div key={i} className="pb-3 border-b border-slate-100 dark:border-slate-700 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{pi.headline}</h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{pi.insight}</p>
                      </div>
                      <div className="shrink-0 text-right space-y-0.5">
                        {pi.engagement && <div className="text-xs text-slate-400 dark:text-slate-500">{pi.engagement}</div>}
                        {pi.sourceUrl && (
                          <a href={pi.sourceUrl} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-[#3289FF] hover:text-[#1C57FF]">View post &nearr;</a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          ) : p.posts.length > 0 ? (
            <Section title={`LinkedIn Activity (${p.posts.length} posts)`}>
              <div className="space-y-3">
                {p.posts.slice(0, 8).map((post, i) => (
                  <div key={i} className="pb-3 border-b border-slate-100 dark:border-slate-700 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed flex-1">
                        {post.text.length > 300 ? post.text.substring(0, 300) + "..." : post.text}
                      </p>
                      <div className="shrink-0 text-right space-y-0.5">
                        <div className="text-xs text-slate-400 dark:text-slate-500">
                          {post.date ? new Date(post.date).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : ""}
                        </div>
                        <div className="text-xs text-slate-300 dark:text-slate-500">
                          {(post.likes ?? 0) > 0 && `${post.likes}L`}{(post.likes ?? 0) > 0 && (post.comments ?? 0) > 0 && " · "}{(post.comments ?? 0) > 0 && `${post.comments}C`}
                        </div>
                        {post.url && (
                          <a href={post.url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-[#3289FF] hover:text-[#1C57FF]">View &nearr;</a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {p.companyIntel && (p.companyIntel.companyName || p.companyIntel.industry) && (
            <Section title="Organization Intel">
              <div className="space-y-2 text-sm">
                {p.companyIntel.companyName && <div><span className="text-slate-400 dark:text-slate-500">Company:</span> <span className="text-slate-700 dark:text-slate-300">{p.companyIntel.companyName}</span></div>}
                {p.companyIntel.industry && <div><span className="text-slate-400 dark:text-slate-500">Industry:</span> <span className="text-slate-700 dark:text-slate-300">{p.companyIntel.industry}</span></div>}
                {p.companyIntel.employeeCount && <div><span className="text-slate-400 dark:text-slate-500">Employees:</span> <span className="text-slate-700 dark:text-slate-300">{p.companyIntel.employeeCount}</span></div>}
                {p.companyIntel.revenue && <div><span className="text-slate-400 dark:text-slate-500">Revenue:</span> <span className="text-slate-700 dark:text-slate-300">{p.companyIntel.revenue}</span></div>}
                {p.companyIntel.yearFounded && <div><span className="text-slate-400 dark:text-slate-500">Founded:</span> <span className="text-slate-700 dark:text-slate-300">{p.companyIntel.yearFounded}</span></div>}
                {(p.companyIntel.specialities?.length ?? 0) > 0 && (
                  <div className="mt-3">
                    <span className="text-slate-400 dark:text-slate-500 block mb-1 text-xs">Specialities:</span>
                    <div className="flex flex-wrap gap-1">
                      {p.companyIntel.specialities!.slice(0, 12).map((s) => (
                        <span key={s} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}

          <Section title={`Skills (${p.skills.length})`} empty={p.skills.length === 0}>
            <div className="flex flex-wrap gap-1.5">
              {p.skills.map((s) => (
                <span key={s} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-1 rounded border border-slate-200 dark:border-slate-700">{s}</span>
              ))}
            </div>
          </Section>

          <Section title="Education" empty={p.education.length === 0}>
            <div className="space-y-3">
              {p.education.map((edu, i) => (
                <div key={i}>
                  <div className="font-medium text-slate-700 dark:text-slate-300 text-sm">{edu.school}</div>
                  {edu.degree && <div className="text-xs text-slate-400 dark:text-slate-500">{edu.degree}{edu.fieldOfStudy ? ` — ${edu.fieldOfStudy}` : ""}</div>}
                </div>
              ))}
            </div>
          </Section>

          <Section title={`Certifications (${p.certifications.length})`} empty={p.certifications.length === 0}>
            <div className="space-y-2">
              {p.certifications.slice(0, 10).map((c, i) => (
                <div key={i} className="text-sm">
                  <div className="text-slate-700 dark:text-slate-300">{c.title}</div>
                  {c.issuer && <div className="text-xs text-slate-400 dark:text-slate-500">{c.issuer}</div>}
                </div>
              ))}
              {p.certifications.length > 10 && <div className="text-xs text-slate-400 dark:text-slate-500">+{p.certifications.length - 10} more</div>}
            </div>
          </Section>

          <Section title="Organizations" empty={p.organizations.length === 0}>
            <div className="space-y-2">
              {p.organizations.map((o, i) => (
                <div key={i} className="text-sm">
                  <div className="text-slate-700 dark:text-slate-300">{o.title}</div>
                  {o.role && <div className="text-xs text-slate-400 dark:text-slate-500">{o.role}</div>}
                </div>
              ))}
            </div>
          </Section>

          <Section title="Languages" empty={p.languages.length === 0}>
            <div className="flex gap-2 flex-wrap">
              {p.languages.map((l) => (
                <span key={l} className="text-sm text-slate-600 dark:text-slate-300">{l}</span>
              ))}
            </div>
          </Section>

          <Section title="Honors & Awards" empty={p.honorsAndAwards.length === 0}>
            <div className="space-y-2">
              {p.honorsAndAwards.map((a, i) => (
                <div key={i} className="text-sm">
                  <div className="text-slate-700 dark:text-slate-300">{a.title}</div>
                  {a.issuer && <div className="text-xs text-slate-400 dark:text-slate-500">{a.issuer}</div>}
                </div>
              ))}
            </div>
          </Section>

          <Section title="Volunteering" empty={p.volunteering.length === 0}>
            <div className="space-y-2">
              {p.volunteering.map((v, i) => (
                <div key={i} className="text-sm">
                  <div className="text-slate-700 dark:text-slate-300">{v.role}</div>
                  {v.organization && <div className="text-xs text-slate-400 dark:text-slate-500">{v.organization}</div>}
                </div>
              ))}
            </div>
          </Section>

          {((p.connectionsCount ?? 0) > 0 || (p.followerCount ?? 0) > 0) && (
            <Section title="Network">
              <div className="flex gap-6 text-sm">
                {(p.connectionsCount ?? 0) > 0 && <div><span className="text-slate-700 dark:text-slate-300 font-medium">{p.connectionsCount}</span> <span className="text-slate-400 dark:text-slate-500">connections</span></div>}
                {(p.followerCount ?? 0) > 0 && <div><span className="text-slate-700 dark:text-slate-300 font-medium">{p.followerCount}</span> <span className="text-slate-400 dark:text-slate-500">followers</span></div>}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
