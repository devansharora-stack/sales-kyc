"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { CompanyDetail, Source, SolutionId, SolutionMapping, EstimatedImpact } from "@/lib/types";
import { ALL_SOLUTIONS, RATING_LABELS } from "@/lib/types";

const solName = (id: SolutionId | string) =>
  ALL_SOLUTIONS.find(s => s.id === id)?.name ?? id;

// Colors
const BLUE = [50, 137, 255] as const;
const DARK = [15, 23, 42] as const;
const SLATE700 = [51, 65, 85] as const;
const SLATE500 = [100, 116, 139] as const;
const SLATE400 = [148, 163, 184] as const;
const WHITE = [255, 255, 255] as const;
const LIGHT_BG = [248, 250, 255] as const;

const RATING_COLORS: Record<string, readonly [number, number, number]> = {
  A: [16, 185, 129], B: [59, 130, 246], C: [245, 158, 11],
  D: [249, 115, 22], E: [239, 68, 68], F: [100, 116, 139],
};

const SEVERITY_COLORS: Record<string, readonly [number, number, number]> = {
  Critical: [239, 68, 68], High: [249, 115, 22], Medium: [245, 158, 11],
};

export function generateCompanyPDF(company: CompanyDetail) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  const CW = W - M * 2;
  let y = M;

  // ─── Helpers ───

  function checkPage(needed: number) {
    if (y + needed > H - 15) { doc.addPage(); y = M; }
  }

  function setColor(c: readonly [number, number, number]) {
    doc.setTextColor(c[0], c[1], c[2]);
  }

  function drawRect(x: number, yy: number, w: number, h: number, color: readonly [number, number, number]) {
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(x, yy, w, h, "F");
  }

  function drawRoundRect(x: number, yy: number, w: number, h: number, r: number, color: readonly [number, number, number]) {
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(x, yy, w, h, r, r, "F");
  }

  function heading(text: string, size = 13) {
    checkPage(12);
    doc.setFontSize(size);
    doc.setFont("helvetica", "bold");
    setColor(DARK);
    doc.text(text, M, y);
    y += size * 0.4 + 3;
  }

  function subheading(text: string) {
    checkPage(8);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    setColor(SLATE700);
    doc.text(text, M, y);
    y += 5.5;
  }

  function body(text: string, indent = 0, maxWidth?: number) {
    if (!text) return;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    setColor(SLATE700);
    const lines = doc.splitTextToSize(text, maxWidth || CW - indent);
    for (const line of lines) {
      checkPage(4.5);
      doc.text(line, M + indent, y);
      y += 4.5;
    }
    y += 1;
  }

  function labelValue(label: string, value: string, indent = 4) {
    checkPage(6);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    setColor(SLATE500);
    doc.text(label + ":", M + indent, y);
    const lw = doc.getTextWidth(label + ":  ");
    doc.setFont("helvetica", "normal");
    setColor(SLATE700);
    const valLines = doc.splitTextToSize(value, CW - indent - lw);
    doc.text(valLines[0], M + indent + lw, y);
    y += 4.5;
    for (let i = 1; i < valLines.length; i++) {
      checkPage(4.5);
      doc.text(valLines[i], M + indent + lw, y);
      y += 4.5;
    }
  }

  // Wrap to a width, hard-breaking any single token (e.g. a long URL) that is
  // wider than the line. jsPDF's splitTextToSize only breaks on whitespace, so
  // long URLs would otherwise overrun the page edge. Call after setting font size.
  function wrapHard(text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    let cur = "";
    for (const token of text.split(/(\s+)/)) {
      if (token === "") continue;
      if (doc.getTextWidth(cur + token) <= maxWidth) {
        cur += token;
      } else if (doc.getTextWidth(token) > maxWidth) {
        if (cur.trim()) { lines.push(cur.trimEnd()); cur = ""; }
        let chunk = "";
        for (const ch of token) {
          if (doc.getTextWidth(chunk + ch) <= maxWidth) chunk += ch;
          else { lines.push(chunk); chunk = ch; }
        }
        cur = chunk;
      } else {
        if (cur.trim()) lines.push(cur.trimEnd());
        cur = token.trimStart();
      }
    }
    if (cur.trim()) lines.push(cur.trimEnd());
    return lines.length ? lines : [text];
  }

  function sourceLine(src: { label: string; url: string; date: string; type?: string }) {
    checkPage(4);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    setColor(BLUE);
    const text = `↳ ${src.label} (${src.date}) — ${src.url}`;
    const lines = wrapHard(text, CW - 4);
    for (const line of lines) {
      checkPage(3.5);
      doc.text(line, M + 4, y);
      y += 3.5;
    }
  }

  function divider() {
    y += 2;
    doc.setDrawColor(226, 232, 240);
    doc.line(M, y, W - M, y);
    y += 4;
  }

  function sectionGap() { y += 4; }

  function drawScoreBar(x: number, yy: number, pts: number, max: number, barW: number) {
    const pct = pts / max;
    drawRoundRect(x, yy, barW, 3, 1.5, [226, 232, 240]);
    if (pct > 0) {
      const fillW = Math.max(3, barW * pct);
      const color = pct >= 0.8 ? [16, 185, 129] as const : pct >= 0.6 ? BLUE : pct >= 0.4 ? [245, 158, 11] as const : [239, 68, 68] as const;
      drawRoundRect(x, yy, fillW, 3, 1.5, color);
    }
  }

  // ─── 1. HEADER ───

  // Confidential banner
  drawRect(0, 0, W, 8, DARK);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  setColor(WHITE);
  doc.text("CONFIDENTIAL — INTERNAL USE ONLY", W / 2, 5.5, { align: "center" });
  y = 12;

  // Rating badge
  const ratingColor = RATING_COLORS[company.rating] || SLATE500;
  drawRoundRect(M, y, 52, 7, 2, ratingColor);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  setColor(WHITE);
  doc.text(`RATING:  ${company.rating} — ${RATING_LABELS[company.rating]?.toUpperCase()}`, M + 3, y + 5);

  // Score + Urgency + Sales Intel on same line
  doc.setFontSize(9);
  setColor(SLATE500);
  const si = company.salesIntelligence;
  const headerMeta = `Score ${company.totalScore}/100  •  GTM Urgency: ${company.gtm?.urgency || "N/A"}` +
    (si ? `  •  Opp Value: ${si.opportunityValue.score}/10  •  Motion: ${si.salesMotion.motion}` : "");
  doc.text(headerMeta, M + 56, y + 5);
  y += 12;

  // Company name
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  setColor(DARK);
  doc.text(company.name, M, y);
  y += 9;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  setColor(BLUE);
  doc.text("AI-Powered Account Intelligence Report", M, y);
  y += 8;

  // ─── 2. QUICK FACTS GRID ───

  const facts = [
    ["INDUSTRY", `${company.industry} — ${company.subSector}`],
    ["HEADQUARTERS", `${company.hqCity}, ${company.state}`],
    ["REVENUE", company.revenue?.value || "N/A"],
    ["EMPLOYEES", company.employees?.value || "N/A"],
    ["CLOUD", company.techLandscape?.cloudProviders?.value?.join(", ") || "N/A"],
    ["COLLABORATION", company.techLandscape?.workspacePlatform?.value || "N/A"],
  ];

  drawRect(M, y, CW, facts.length * 5.5 + 4, LIGHT_BG);
  const factY = y + 3;
  facts.forEach((f, i) => {
    const fy = factY + i * 5.5;
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    setColor(SLATE500);
    doc.text(f[0], M + 3, fy + 3);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    setColor(SLATE700);
    doc.text(f[1], M + 38, fy + 3);
  });
  y = factY + facts.length * 5.5 + 3;
  y += 3;

  // Business description
  body(company.businessDescription);
  y += 1;

  // Prepared for / Date
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  setColor(SLATE500);
  doc.text("PREPARED FOR", M, y);
  doc.text("DATE", M + 80, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  setColor(SLATE700);
  doc.text("Techolution Sales Team", M, y);
  doc.text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), M + 80, y);
  y += 6;

  divider();

  // ─── 3. EXECUTIVE SUMMARY ───

  heading("Executive Summary");
  body(company.execSummary);
  sectionGap();

  // ─── SALES INTELLIGENCE ───

  if (company.salesIntelligence) {
    const si = company.salesIntelligence;
    heading("Sales Intelligence");

    // Opportunity Value
    checkPage(20);
    subheading(`Opportunity Value: ${si.opportunityValue.score}/10`);
    labelValue("Est. First Year", si.opportunityValue.estimatedFirstYear);
    labelValue("Est. Expansion", si.opportunityValue.estimatedExpansion);
    body(si.opportunityValue.reasoning, 4);
    y += 2;

    // Sales Motion
    checkPage(20);
    subheading(`Sales Motion: ${si.salesMotion.motion} (${si.salesMotion.score}/10)`);
    labelValue("Cycle Length", si.salesMotion.cycleLength);
    labelValue("Build vs Buy Risk", si.salesMotion.buildVsBuyRisk);
    body(si.salesMotion.reasoning, 4);

    divider();
  }

  // ─── 4. ACCOUNT SCORE ───

  heading(`Account Score: ${company.totalScore}/100`);

  const dims: [string, keyof typeof company.scores, number][] = [
    ["Budget Signal", "budgetSignal", 25],
    ["Solution Fit", "solutionFit", 25],
    ["Trigger Recency", "triggerRecency", 20],
    ["AI Maturity", "aiMaturity", 15],
    ["Gemini Alignment", "geminiAlignment", 15],
  ];

  // Score summary table
  const scoreTableData = dims.map(([label, key, max]) => {
    const dim = company.scores?.[key];
    const pts = dim?.points ?? 0;
    return [label, `${pts} / ${max}`];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [["Criterion", "Score"]],
    body: scoreTableData,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2, lineColor: [226, 232, 240] as [number, number, number], lineWidth: 0.3 },
    headStyles: { fillColor: [248, 250, 255] as [number, number, number], textColor: [...SLATE500] as [number, number, number], fontStyle: "bold", fontSize: 8 } as const,
    bodyStyles: { textColor: [...SLATE700] as [number, number, number] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 }, 1: { cellWidth: 30 } },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // Detailed score reasoning
  for (const [label, key, max] of dims) {
    const dim = company.scores?.[key];
    if (!dim) continue;
    checkPage(20);
    subheading(`${label} — ${dim.points}/${max}`);
    body(dim.reasoning, 4);
    if (dim.sources?.length) {
      dim.sources.slice(0, 2).forEach(s => sourceLine(s));
    }
    y += 2;
  }

  sectionGap();
  divider();

  // ─── 5. TOP SOLUTIONS ───

  heading("Top Recommended Solutions");
  body("Solutions are prioritized based on pain point severity, urgency of triggers, and alignment with operational challenges.");
  y += 2;

  const sortedSolutions = [...(company.solutionMappings || [])].sort((a, b) => {
    const priority = { Primary: 0, Secondary: 1, Tertiary: 2 };
    return (priority[a.priority] ?? 3) - (priority[b.priority] ?? 3);
  });

  sortedSolutions.forEach((m, i) => {
    checkPage(40);

    // Solution header with badge
    const badgeText = m.priority === "Primary" ? "PRIMARY" : m.priority.toUpperCase();
    const isEntry = i === 0;

    drawRoundRect(M, y, CW, 8, 2, LIGHT_BG);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    setColor(DARK);
    doc.text(`#${i + 1}   ${m.solutionName}`, M + 3, y + 5.5);

    // Priority badge
    const badgeX = M + CW - 35;
    drawRoundRect(badgeX, y + 1.5, isEntry ? 33 : 22, 5, 1.5, BLUE);
    doc.setFontSize(6.5);
    setColor(WHITE);
    doc.text(isEntry ? `${badgeText} — ENTRY` : badgeText, badgeX + 2, y + 5);
    y += 12;

    // The Problem
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    setColor(SLATE500);
    doc.text("The Problem", M, y);
    y += 5;
    body(m.painPoint, 4);

    // How We Solve It
    doc.setFont("helvetica", "bold");
    setColor(SLATE500);
    doc.text("How We Solve It", M, y);
    y += 5;
    body(m.value, 4);

    // Reasoning
    if (m.reasoning) {
      body(m.reasoning, 4);
    }

    // Estimated Impact
    if (m.estimatedImpact) {
      checkPage(12);
      doc.setFont("helvetica", "bold");
      setColor(SLATE500);
      doc.text("Estimated Impact", M, y);
      y += 5;
      const impactText = typeof m.estimatedImpact === "string"
        ? m.estimatedImpact
        : (m.estimatedImpact as EstimatedImpact).summary +
          ((m.estimatedImpact as EstimatedImpact).reasoning?.length
            ? " " + (m.estimatedImpact as EstimatedImpact).reasoning.join(" ")
            : "");
      body(impactText, 4);
    }

    // Fit Score
    if (m.fitScore != null) {
      checkPage(8);
      labelValue("Fit Score", `${m.fitScore}/100`, 4);
    }

    // Proof Point
    if (m.proofPoint?.client) {
      checkPage(8);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      setColor(SLATE500);
      doc.text("✦ Proof Point", M + 4, y);
      y += 4;
      doc.setFont("helvetica", "normal");
      setColor(SLATE700);
      doc.text(`${m.proofPoint.client} — ${m.proofPoint.outcome || ""}`, M + 4, y);
      y += 5;
    }

    // Sources
    if (m.sources?.length) {
      m.sources.slice(0, 3).forEach(s => sourceLine(s));
    }

    y += 4;
  });

  divider();

  // ─── 6. TRIGGER EVENTS ───

  heading("Key Trigger Events");

  for (const t of (company.triggerEvents || [])) {
    checkPage(25);

    // Category + date badge
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    setColor(SLATE700);
    doc.text(`${t.event}`, M, y);
    y += 5;

    const catColor = SEVERITY_COLORS[t.category] || BLUE;
    drawRoundRect(M, y, doc.getTextWidth(` ${t.category} `) + 4, 4.5, 1.5, catColor);
    doc.setFontSize(6.5);
    setColor(WHITE);
    doc.text(t.category, M + 2, y + 3.2);
    const catW = doc.getTextWidth(` ${t.category} `) + 6;

    doc.setFontSize(7.5);
    setColor(SLATE500);
    doc.text(t.date, M + catW + 2, y + 3.2);
    y += 8;

    body(t.detail, 4);

    if (t.impact) {
      checkPage(8);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      setColor(SLATE700);
      doc.text("Impact: ", M + 4, y);
      doc.setFont("helvetica", "normal");
      const impW = doc.getTextWidth("Impact: ");
      const impLines = doc.splitTextToSize(t.impact, CW - 4 - impW);
      doc.text(impLines[0], M + 4 + impW, y);
      y += 4.5;
      for (let i = 1; i < impLines.length; i++) {
        checkPage(4.5);
        doc.text(impLines[i], M + 4, y);
        y += 4.5;
      }
    }

    if (t.sources?.length) {
      t.sources.slice(0, 2).forEach(s => sourceLine(s));
    }

    y += 4;
  }

  divider();

  // ─── 7. PAIN POINTS ───

  heading("Identified Pain Points");

  // Summary table
  const painTableData = (company.painPoints || []).map(p => [
    p.title,
    p.severity,
    p.techolutionSolutions?.map(s => solName(s)).join(", ") || "—",
  ]);

  if (painTableData.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [["Pain Point", "Severity", "Mapped Solution"]],
      body: painTableData,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2, lineColor: [226, 232, 240] as [number, number, number], lineWidth: 0.3 },
      headStyles: { fillColor: [248, 250, 255] as [number, number, number], textColor: [...SLATE500] as [number, number, number], fontStyle: "bold" },
      bodyStyles: { textColor: [...SLATE700] as [number, number, number] },
      columnStyles: { 0: { cellWidth: 65 }, 1: { cellWidth: 20 } },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  // Detailed pain points
  (company.painPoints || []).forEach((p, i) => {
    checkPage(20);
    subheading(`${i + 1}. ${p.title}   [${p.severity}]`);
    body(p.description, 4);
    if (p.sources?.length) {
      p.sources.slice(0, 2).forEach(s => sourceLine(s));
    }
    y += 2;
  });

  divider();

  // ─── 8. TECHNOLOGY LANDSCAPE ───

  heading("Technology Landscape");

  const tl = company.techLandscape;
  if (tl) {
    const techData: string[][] = [];
    if (tl.cloudProviders?.value?.length) techData.push(["Cloud", tl.cloudProviders.value.join(", ")]);
    if (tl.workspacePlatform?.value) techData.push(["Workspace", tl.workspacePlatform.value]);
    if (tl.knownAIDeployments?.value?.length) techData.push(["AI Deployments", tl.knownAIDeployments.value.join(", ")]);
    if (tl.knownVendors?.value?.length) techData.push(["Known Vendors", tl.knownVendors.value.join(", ")]);
    if (tl.knownSystems?.value?.length) techData.push(["Known Systems", tl.knownSystems.value.join(", ")]);

    if (techData.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [["Layer", "System"]],
        body: techData,
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 2, lineColor: [226, 232, 240] as [number, number, number], lineWidth: 0.3 },
        headStyles: { fillColor: [248, 250, 255] as [number, number, number], textColor: [...SLATE500] as [number, number, number], fontStyle: "bold" },
        bodyStyles: { textColor: [...SLATE700] as [number, number, number] },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 35 } },
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
    }

    // Tech sources
    const techSources = [
      ...(tl.cloudProviders?.sources || []),
      ...(tl.workspacePlatform?.sources || []),
      ...(tl.knownVendors?.sources || []),
    ];
    const seenUrls = new Set<string>();
    techSources.forEach(s => {
      if (s.url && !seenUrls.has(s.url)) {
        seenUrls.add(s.url);
        sourceLine(s);
      }
    });
  }

  divider();

  // ─── 9. STAKEHOLDERS ───

  heading("Key Stakeholders");

  const tiers = ["Decision Maker", "Champion", "Influencer"] as const;
  for (const tier of tiers) {
    const group = company.stakeholders?.filter(s => s.tier === tier) || [];
    if (group.length === 0) continue;

    for (const s of group) {
      checkPage(18);

      // Name + tier badge
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      setColor(DARK);
      doc.text(s.name, M, y);

      const tierBadgeColor = tier === "Decision Maker" ? BLUE : tier === "Champion" ? [16, 185, 129] as const : [245, 158, 11] as const;
      const nameW = doc.getTextWidth(s.name);
      drawRoundRect(M + nameW + 4, y - 3.5, doc.getTextWidth(tier) + 6, 5, 1.5, tierBadgeColor);
      doc.setFontSize(6.5);
      setColor(WHITE);
      doc.text(tier.toUpperCase(), M + nameW + 7, y - 0.5);
      y += 5;

      // Title
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      setColor(SLATE500);
      doc.text(s.title, M, y);
      y += 5;

      // Relevance
      if (s.relevance) body(s.relevance, 0);

      // Source URL
      if (s.sourceUrl) {
        doc.setFontSize(7);
        setColor(BLUE);
        for (const l of wrapHard(s.sourceUrl, CW)) {
          checkPage(3.5);
          doc.text(l, M, y);
          y += 3.5;
        }
        y += 0.5;
      }

      y += 3;
    }
  }

  divider();

  // ─── 10. GTM STRATEGY ───

  if (company.gtm) {
    heading("Recommended Engagement Strategy");
    body(company.gtm.brief);
    y += 2;

    // Entry strategy steps
    if (company.gtm.entryStrategy?.length) {
      subheading("Approach");
      company.gtm.entryStrategy.forEach((s, i) => {
        checkPage(8);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        setColor(SLATE700);
        const stepLines = doc.splitTextToSize(`${i + 1}. ${s}`, CW - 8);
        for (const line of stepLines) {
          checkPage(4.5);
          doc.text(line, M + 4, y);
          y += 4.5;
        }
        y += 1;
      });
      y += 2;
    }

    // Competitive positioning
    if (company.gtm.competitivePositioning) {
      subheading("Competitive Positioning");
      body(company.gtm.competitivePositioning, 4);
    }

    // Urgency
    if (company.gtm.urgencyReasoning) {
      checkPage(12);
      labelValue("Urgency", `${company.gtm.urgency} — ${company.gtm.urgencyReasoning}`);
    }

    // Pilot strategy
    if (company.gtm.pilotStrategy) {
      checkPage(25);
      subheading("Pilot Strategy");
      labelValue("Title", company.gtm.pilotStrategy.title);
      labelValue("Scope", company.gtm.pilotStrategy.scope);
      labelValue("Duration", company.gtm.pilotStrategy.duration);
      labelValue("Success Metric", company.gtm.pilotStrategy.successMetric);
      labelValue("Budget", company.gtm.pilotStrategy.estimatedBudget);
      y += 2;
    }

    // Expand path
    if (company.gtm.expandPath) {
      labelValue("Expansion Path", company.gtm.expandPath);
    }

    if (company.gtm.sources?.length) {
      company.gtm.sources.slice(0, 3).forEach(s => sourceLine(s));
    }
  }

  divider();

  // ─── 11. SOURCES BIBLIOGRAPHY ───

  heading("Sources");

  const allSources: Source[] = [];
  const seenSrc = new Set<string>();
  const addSrc = (s?: Source[]) => {
    s?.forEach(src => {
      if (src?.url && !seenSrc.has(src.url)) {
        seenSrc.add(src.url);
        allSources.push(src);
      }
    });
  };
  addSrc(company.sources);
  addSrc(company.revenue?.sources);
  addSrc(company.employees?.sources);
  company.triggerEvents?.forEach(t => addSrc(t.sources));
  company.painPoints?.forEach(p => addSrc(p.sources));
  company.solutionMappings?.forEach(m => {
    addSrc(m.sources);
    if (m.estimatedImpact && typeof m.estimatedImpact === "object") {
      addSrc((m.estimatedImpact as EstimatedImpact).sources);
    }
  });
  if (company.gtm) {
    addSrc(company.gtm.sources);
    addSrc(company.gtm.briefSources);
    addSrc(company.gtm.entrySolutionSources);
    addSrc(company.gtm.urgencySources);
    addSrc(company.gtm.competitiveSources);
  }
  if (company.scores) {
    Object.values(company.scores).forEach((dim: unknown) => {
      addSrc((dim as { sources?: Source[] })?.sources);
    });
  }
  if (tl) {
    addSrc(tl.cloudProviders?.sources);
    addSrc(tl.workspacePlatform?.sources);
    addSrc(tl.knownAIDeployments?.sources);
    addSrc(tl.knownVendors?.sources);
    addSrc(tl.knownSystems?.sources);
  }

  allSources.forEach((s, i) => {
    checkPage(5);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    setColor(SLATE500);
    const num = String(i + 1).padStart(2, "0");
    const line = `${num}.  [${s.type}] ${s.label} (${s.date})  ${s.url}`;
    const lines = wrapHard(line, CW);
    for (const l of lines) {
      checkPage(3.5);
      doc.text(l, M, y);
      y += 3.5;
    }
    y += 0.5;
  });

  // ─── FOOTER ON ALL PAGES ───

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Top line on all pages after first
    if (i > 1) {
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      setColor(SLATE400);
      doc.text(`${company.name} — AI-Powered Account Intelligence Report`, M, 8);
      doc.text(`Page ${i}`, W - M, 8, { align: "right" });
      doc.setDrawColor(226, 232, 240);
      doc.line(M, 10, W - M, 10);
    }

    // Bottom footer
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    setColor(SLATE400);
    doc.setDrawColor(226, 232, 240);
    doc.line(M, H - 12, W - M, H - 12);
    doc.text(`KYC Genie  •  ${company.name}  •  Page ${i}/${pageCount}  •  Generated ${new Date().toLocaleDateString()}`, M, H - 8);
    doc.text("Confidential — Internal Use Only", W - M, H - 8, { align: "right" });
  }

  doc.save(`${company.slug || company.name.toLowerCase().replace(/\s+/g, "-")}-intelligence-report.pdf`);
}

// ───────────────────────────────────────────────────────────────────────────
// One-pager: the whole account on a single dense A4 page — built for a rep to
// scan in 30 seconds before a call. Caps + clamps everything to guarantee fit.
// ───────────────────────────────────────────────────────────────────────────
export function generateCompanyOnePager(company: CompanyDetail) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  const CW = W - M * 2;

  const setColor = (c: readonly number[]) => doc.setTextColor(c[0], c[1], c[2]);
  const fill = (c: readonly number[]) => doc.setFillColor(c[0], c[1], c[2]);
  const clamp = (t: string | undefined, n: number) =>
    !t ? "" : t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;

  const tl = company.techLandscape;
  const si = company.salesIntelligence;
  let y = 0;

  // Pill badge sized to its text; returns the x just past it.
  function pill(x: number, yy: number, text: string, bg: readonly number[], fg: readonly number[] = WHITE) {
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    const w = doc.getTextWidth(text) + 4;
    fill(bg);
    doc.roundedRect(x, yy - 3.2, w, 4.6, 1.2, 1.2, "F");
    setColor(fg);
    doc.text(text, x + 2, yy);
    return x + w + 2;
  }

  function miniHeading(x: number, yy: number, text: string) {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    setColor(BLUE);
    doc.text(text.toUpperCase(), x, yy);
    return yy + 4.5;
  }

  // ── Confidential band ──
  fill(DARK);
  doc.rect(0, 0, W, 6, "F");
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  setColor(WHITE);
  doc.text("CONFIDENTIAL — INTERNAL USE ONLY", W / 2, 4, { align: "center" });
  y = 13;

  // ── Header: name + score ──
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  setColor(DARK);
  doc.text(clamp(company.name, 40), M, y);
  doc.setFontSize(17);
  setColor(BLUE);
  doc.text(`${company.totalScore}`, W - M, y, { align: "right" });
  doc.setFontSize(8);
  setColor(SLATE400);
  doc.text("/100", W - M - doc.getTextWidth(`${company.totalScore}`) * 0 - 0.5, y, { align: "right", baseline: "bottom" });
  y += 5;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  setColor(SLATE500);
  doc.text(clamp(`${company.industry} · ${company.subSector} · ${company.hqCity}, ${company.state}`, 95), M, y);
  y += 5;

  // ── Badge row ──
  let bx = M;
  bx = pill(bx, y, `${company.rating} ${RATING_LABELS[company.rating] || ""}`.trim(), RATING_COLORS[company.rating] || SLATE500);
  if (company.gtm?.urgency) bx = pill(bx, y, `URGENCY: ${company.gtm.urgency.toUpperCase()}`, SEVERITY_COLORS[company.gtm.urgency] || BLUE);
  if (si?.salesMotion?.motion) bx = pill(bx, y, si.salesMotion.motion.toUpperCase(), SLATE700);
  if (company.geminiStatus) bx = pill(bx, y, `GEMINI: ${company.geminiStatus.toUpperCase()}`, BLUE);
  y += 6;

  // ── Stat strip ──
  const stats: [string, string][] = [
    ["REVENUE", clamp(company.revenue?.value, 16) || "N/A"],
    ["EMPLOYEES", clamp(company.employees?.value, 14) || "N/A"],
    ["TRIGGERS", `${company.triggerEvents?.length || 0}`],
    ["STAKEHOLDERS", `${company.stakeholders?.length || 0}`],
    ["OPP / YR 1", clamp(si?.opportunityValue?.estimatedFirstYear, 14) || "—"],
  ];
  fill(LIGHT_BG);
  doc.roundedRect(M, y, CW, 11, 1.5, 1.5, "F");
  const colW = CW / stats.length;
  stats.forEach(([label, val], i) => {
    const cx = M + i * colW + 3;
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    setColor(SLATE400);
    doc.text(label, cx, y + 4);
    doc.setFontSize(8.5);
    setColor(SLATE700);
    doc.text(val, cx, y + 8.5);
  });
  y += 15;

  // ── Score bars (5 dimensions) ──
  const dims: [string, number, number][] = [
    ["Budget", company.scores?.budgetSignal?.points ?? 0, 25],
    ["Fit", company.scores?.solutionFit?.points ?? 0, 25],
    ["Trigger", company.scores?.triggerRecency?.points ?? 0, 20],
    ["AI Mat.", company.scores?.aiMaturity?.points ?? 0, 15],
    ["Gemini", company.scores?.geminiAlignment?.points ?? 0, 15],
  ];
  doc.setFontSize(7);
  dims.forEach(([label, pts, max]) => {
    doc.setFont("helvetica", "normal");
    setColor(SLATE500);
    doc.text(label, M, y + 2.2);
    const barX = M + 20;
    const barW = 58;
    fill([226, 232, 240]);
    doc.roundedRect(barX, y, barW, 2.4, 1, 1, "F");
    const pct = max ? pts / max : 0;
    const c = pct >= 0.8 ? [16, 185, 129] : pct >= 0.6 ? BLUE : pct >= 0.4 ? [245, 158, 11] : [239, 68, 68];
    if (pct > 0) { fill(c); doc.roundedRect(barX, y, Math.max(2, barW * pct), 2.4, 1, 1, "F"); }
    setColor(SLATE500);
    doc.text(`${pts}/${max}`, barX + barW + 3, y + 2.2);
    y += 4;
  });
  y += 2;

  // ── Exec summary (clamped) ──
  if (company.execSummary) {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    setColor(SLATE700);
    const lines = doc.splitTextToSize(company.execSummary, CW).slice(0, 3);
    doc.text(lines, M, y);
    y += lines.length * 3.6 + 2;
  }

  // ── Divider ──
  doc.setDrawColor(226, 232, 240);
  doc.line(M, y, W - M, y);
  y += 5;

  // ── Two-column body ──
  const gap = 6;
  const colWidth = (CW - gap) / 2;
  const leftX = M;
  const rightX = M + colWidth + gap;
  let yL = y;
  let yR = y;

  // LEFT: Why Now + Pain Points
  yL = miniHeading(leftX, yL, "Why Now");
  (company.triggerEvents || []).slice(0, 3).forEach((t) => {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    setColor(SLATE700);
    const tl2 = doc.splitTextToSize(`• ${clamp(t.event, 70)}`, colWidth);
    doc.text(tl2.slice(0, 2), leftX, yL);
    yL += Math.min(tl2.length, 2) * 3.4;
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    setColor(SLATE400);
    doc.text(clamp(`${t.category} · ${t.date}`, 50), leftX + 2.5, yL);
    yL += 4.2;
  });
  yL += 2;
  yL = miniHeading(leftX, yL, "Pain Points");
  (company.painPoints || []).slice(0, 4).forEach((p) => {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    setColor(SLATE700);
    const sev = p.severity ? ` [${p.severity}]` : "";
    const pl = doc.splitTextToSize(`• ${clamp(p.title, 60)}${sev}`, colWidth);
    doc.text(pl.slice(0, 2), leftX, yL);
    yL += Math.min(pl.length, 2) * 3.4 + 1.5;
  });

  // RIGHT: Recommended Solutions + Sales Motion
  const sorted = [...(company.solutionMappings || [])].sort((a, b) => {
    const pr = { Primary: 0, Secondary: 1, Tertiary: 2 } as Record<string, number>;
    return (pr[a.priority] ?? 3) - (pr[b.priority] ?? 3);
  });
  yR = miniHeading(rightX, yR, "Recommended Solutions");
  sorted.slice(0, 3).forEach((m, i) => {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    setColor(DARK);
    const fit = m.fitScore != null ? `  (${m.fitScore})` : "";
    doc.text(clamp(`#${i + 1} ${m.solutionName}`, 38), rightX, yR);
    doc.setFontSize(6);
    setColor(BLUE);
    doc.text(`${m.priority.toUpperCase()}${fit}`, rightX + colWidth, yR, { align: "right" });
    yR += 3.6;
    doc.setFontSize(6.8);
    doc.setFont("helvetica", "normal");
    setColor(SLATE500);
    const pl = doc.splitTextToSize(clamp(m.painPoint, 90), colWidth);
    doc.text(pl.slice(0, 2), rightX, yR);
    yR += Math.min(pl.length, 2) * 3.2 + 2;
  });
  yR += 1;
  if (si) {
    yR = miniHeading(rightX, yR, "Sales Motion");
    const rows: [string, string][] = [
      ["Motion", si.salesMotion?.motion || "—"],
      ["Cycle", si.salesMotion?.cycleLength || "—"],
      ["Build-vs-Buy risk", si.salesMotion?.buildVsBuyRisk || "—"],
      ["Opp / Year 1", si.opportunityValue?.estimatedFirstYear || "—"],
      ["Expansion", si.opportunityValue?.estimatedExpansion || "—"],
    ];
    rows.forEach(([k, v]) => {
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      setColor(SLATE400);
      doc.text(k, rightX, yR);
      doc.setFont("helvetica", "bold");
      setColor(SLATE700);
      doc.text(clamp(v, 30), rightX + colWidth, yR, { align: "right" });
      yR += 4;
    });
  }

  y = Math.max(yL, yR) + 3;

  // ── Key stakeholders (full width) ──
  doc.setDrawColor(226, 232, 240);
  doc.line(M, y, W - M, y);
  y += 5;
  y = miniHeading(M, y, "Key Stakeholders");
  const tierColor: Record<string, readonly number[]> = {
    "Decision Maker": BLUE,
    Champion: [16, 185, 129],
    Influencer: [245, 158, 11],
  };
  (company.stakeholders || []).slice(0, 6).forEach((s) => {
    if (y > H - 16) return;
    let x = M;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    setColor(SLATE700);
    doc.text(clamp(s.name, 28), x, y);
    x += doc.getTextWidth(clamp(s.name, 28)) + 3;
    doc.setFont("helvetica", "normal");
    setColor(SLATE500);
    doc.text(clamp(`— ${s.title}`, 60), x, y);
    if (s.tier) pill(W - M - (doc.getTextWidth(s.tier) + 4), y, s.tier, tierColor[s.tier] || SLATE500);
    y += 5;
  });

  // ── Footer ──
  setColor(SLATE400);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setDrawColor(226, 232, 240);
  doc.line(M, H - 11, W - M, H - 11);
  doc.text(`KYC Genie  •  ${company.name}  •  One-Pager  •  Generated ${new Date().toLocaleDateString()}`, M, H - 7);
  doc.text("Confidential — Internal Use Only", W - M, H - 7, { align: "right" });

  doc.save(`${company.slug || company.name.toLowerCase().replace(/\s+/g, "-")}-one-pager.pdf`);
}
