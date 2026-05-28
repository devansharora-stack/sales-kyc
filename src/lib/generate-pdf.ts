"use client";

import jsPDF from "jspdf";
import type { CompanyDetail, SolutionId } from "@/lib/types";
import { ALL_SOLUTIONS, RATING_LABELS } from "@/lib/types";

const solName = (id: SolutionId | string) =>
  ALL_SOLUTIONS.find(s => s.id === id)?.name ?? id;

export function generateCompanyPDF(company: CompanyDetail) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const checkPage = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 15) {
      doc.addPage();
      y = margin;
    }
  };

  const heading = (text: string, size = 14) => {
    checkPage(12);
    doc.setFontSize(size);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(text, margin, y);
    y += size * 0.45 + 2;
  };

  const subheading = (text: string) => {
    checkPage(8);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text(text, margin, y);
    y += 5;
  };

  const body = (text: string, indent = 0) => {
    if (!text) return;
    checkPage(8);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    const lines = doc.splitTextToSize(text, contentWidth - indent);
    for (const line of lines) {
      checkPage(4.5);
      doc.text(line, margin + indent, y);
      y += 4.5;
    }
    y += 1;
  };

  const bullet = (text: string, indent = 4) => {
    checkPage(6);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    doc.text("•", margin + indent - 3, y);
    const lines = doc.splitTextToSize(text, contentWidth - indent - 2);
    for (const line of lines) {
      checkPage(4.5);
      doc.text(line, margin + indent, y);
      y += 4.5;
    }
  };

  const divider = () => {
    y += 2;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;
  };

  const labelValue = (label: string, value: string) => {
    checkPage(6);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 116, 139);
    doc.text(label + ":", margin + 4, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    doc.text(value, margin + 4 + doc.getTextWidth(label + ":  "), y);
    y += 5;
  };

  // ─── Header ───
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(company.name, margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(`${company.industry} · ${company.subSector} · ${company.hqCity}, ${company.state}`, margin, y);
  y += 5;

  // Score + Rating
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(50, 137, 255);
  doc.text(`Score: ${company.totalScore}/100  ·  Rating: ${company.rating} (${RATING_LABELS[company.rating]})  ·  Urgency: ${company.gtm?.urgency || "N/A"}`, margin, y);
  y += 5;

  divider();

  // ─── Key Facts ───
  heading("Key Facts", 12);
  labelValue("Revenue", company.revenue?.value || "N/A");
  labelValue("Employees", company.employees?.value || "N/A");
  labelValue("Gemini Status", company.geminiStatus);
  labelValue("Generated", new Date(company.generatedDate).toLocaleDateString());
  y += 2;

  // ─── Executive Summary ───
  heading("Executive Summary", 12);
  body(company.execSummary);
  y += 2;

  // ─── Score Breakdown ───
  heading("Score Breakdown", 12);
  const dims = [
    ["Budget Signal", company.scores?.budgetSignal, 25],
    ["Solution Fit", company.scores?.solutionFit, 25],
    ["Trigger Recency", company.scores?.triggerRecency, 20],
    ["AI Maturity", company.scores?.aiMaturity, 15],
    ["Gemini Alignment", company.scores?.geminiAlignment, 15],
  ] as const;

  for (const [label, dim, max] of dims) {
    if (!dim) continue;
    checkPage(12);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(`${label}: ${dim.points}/${max}`, margin + 4, y);
    y += 4.5;
    body(dim.reasoning, 4);
  }
  y += 2;

  // ─── Trigger Events ───
  if (company.triggerEvents?.length) {
    heading("Trigger Events", 12);
    for (const t of company.triggerEvents) {
      checkPage(15);
      subheading(`[${t.date}] ${t.category} — ${t.event}`);
      body(t.detail, 4);
      if (t.impact) {
        doc.setFont("helvetica", "bold");
        checkPage(5);
        doc.text("Impact: ", margin + 4, y);
        doc.setFont("helvetica", "normal");
        const impactLines = doc.splitTextToSize(t.impact, contentWidth - 4 - doc.getTextWidth("Impact: "));
        doc.text(impactLines[0], margin + 4 + doc.getTextWidth("Impact: "), y);
        y += 4.5;
        for (let i = 1; i < impactLines.length; i++) {
          doc.text(impactLines[i], margin + 4, y);
          y += 4.5;
        }
      }
      y += 2;
    }
  }

  // ─── Pain Points ───
  if (company.painPoints?.length) {
    heading("Pain Points", 12);
    for (const p of company.painPoints) {
      checkPage(12);
      subheading(`[${p.severity}] ${p.title}`);
      body(p.description, 4);
      if (p.techolutionSolutions?.length) {
        body(`Solutions: ${p.techolutionSolutions.map(s => solName(s)).join(", ")}`, 4);
      }
      y += 1;
    }
  }

  // ─── Solution Mapping ───
  if (company.solutionMappings?.length) {
    heading("Solution Mapping", 12);
    company.solutionMappings.forEach((m, i) => {
      checkPage(20);
      subheading(`${i + 1}. ${m.solutionName} (${m.priority})${m.fitScore != null ? ` — Fit Score: ${m.fitScore}/100` : ""}`);
      labelValue("Pain Point", m.painPoint);
      body(m.value, 4);
      if (m.proofPoint?.client) {
        labelValue("Proof Point", `${m.proofPoint.client} — ${m.proofPoint.outcome || ""}`);
      }
      if (m.estimatedImpact) {
        const impactText = typeof m.estimatedImpact === "string"
          ? m.estimatedImpact
          : m.estimatedImpact.summary + (m.estimatedImpact.reasoning?.length ? "\n    " + m.estimatedImpact.reasoning.join("\n    ") : "");
        labelValue("Est. Impact", impactText);
      }
      body(m.reasoning, 4);
      y += 2;
    });
  }

  // ─── GTM Strategy ───
  if (company.gtm) {
    heading("GTM Strategy", 12);
    body(company.gtm.brief);
    y += 1;

    labelValue("Entry Solution", solName(company.gtm.entrySolution));
    labelValue("Urgency", `${company.gtm.urgency} — ${company.gtm.urgencyReasoning || ""}`);
    y += 1;

    if (company.gtm.entryStrategy?.length) {
      subheading("Entry Strategy Steps:");
      company.gtm.entryStrategy.forEach((s, i) => {
        bullet(`${i + 1}. ${s}`);
      });
      y += 2;
    }

    if (company.gtm.pilotStrategy) {
      subheading("Pilot Strategy:");
      labelValue("Title", company.gtm.pilotStrategy.title);
      labelValue("Scope", company.gtm.pilotStrategy.scope);
      labelValue("Duration", company.gtm.pilotStrategy.duration);
      labelValue("Success Metric", company.gtm.pilotStrategy.successMetric);
      labelValue("Budget", company.gtm.pilotStrategy.estimatedBudget);
      y += 2;
    }

    if (company.gtm.competitivePositioning) {
      subheading("Competitive Positioning:");
      body(company.gtm.competitivePositioning);
    }

    if (company.gtm.expandPath) {
      labelValue("Expansion Path", company.gtm.expandPath);
    }
  }

  // ─── Stakeholders ───
  if (company.stakeholders?.length) {
    heading("Key Stakeholders", 12);
    for (const s of company.stakeholders) {
      checkPage(12);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 41, 59);
      doc.text(`${s.name} — ${s.title}`, margin + 4, y);
      y += 4.5;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(`${s.tier} · ${s.confidence || "unverified"}`, margin + 4, y);
      y += 4.5;
      if (s.relevance) body(s.relevance, 4);
    }
  }

  // ─── Sources ───
  if (company.sources?.length) {
    heading("Sources", 12);
    for (const s of company.sources) {
      checkPage(5);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      const srcText = `${s.label} — ${s.type} — ${s.date}`;
      doc.text(doc.splitTextToSize(srcText, contentWidth)[0], margin + 4, y);
      y += 3.5;
    }
  }

  // ─── Footer ───
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(`KYC Genie · ${company.name} · Page ${i}/${pageCount} · Generated ${new Date().toLocaleDateString()}`, margin, doc.internal.pageSize.getHeight() - 8);
  }

  doc.save(`${company.slug || company.name.toLowerCase().replace(/\s+/g, "-")}-analysis.pdf`);
}
