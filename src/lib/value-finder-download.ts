"use client";

// Direct-download the Outreach One-Pager as a PDF — no redirect, same UX as the
// PDF menu. We render the real <ValueFinderReport> offscreen (so the PDF is a
// pixel-faithful capture of the designed skin), snapshot each of its two page
// sections with html2canvas, and drop them onto two A4 pages via jsPDF.

import { createRoot } from "react-dom/client";
import { createElement } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";
import type { CompanyDetail, ValueFinderCopy } from "@/lib/types";
import ValueFinderReport from "@/components/company/value-finder/ValueFinderReport";
import { getTheme, type Variant } from "@/components/company/value-finder/theme";

// A4 in mm, with a comfortable print margin.
const A4_W = 210;
const A4_H = 297;
const MARGIN = 12;

export async function downloadOnePagerPDF(
  company: CompanyDetail,
  copy: ValueFinderCopy | undefined,
  variant: Variant,
) {
  const theme = getTheme(variant);
  const sheetBg = theme.sheetBg || "#ffffff";

  // Offscreen host sized to the sm: (desktop) layout width, matching the in-app
  // sheet padding so the capture looks identical to the printable view.
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:820px;background:#ffffff;padding:32px;z-index:-1;";
  document.body.appendChild(host);

  const root = createRoot(host);
  root.render(createElement(ValueFinderReport, { company, copy, variant }));

  try {
    // Let React paint, webfonts load, then a beat for layout to settle.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((r) => setTimeout(r, 450));

    const sections = Array.from(
      host.querySelectorAll<HTMLElement>(".vf-page-1, .vf-page-2"),
    );
    if (sections.length === 0) throw new Error("report sections not found");

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const maxW = A4_W - MARGIN * 2;
    const maxH = A4_H - MARGIN * 2;

    for (let i = 0; i < sections.length; i++) {
      const canvas = await html2canvas(sections[i], {
        scale: 2,
        backgroundColor: sheetBg,
        useCORS: true,
        logging: false,
      });
      // Fit within the printable box, preserving aspect ratio.
      const ratio = canvas.width / canvas.height;
      let w = maxW;
      let h = w / ratio;
      if (h > maxH) {
        h = maxH;
        w = h * ratio;
      }
      const x = (A4_W - w) / 2;
      if (i > 0) doc.addPage();
      doc.addImage(canvas.toDataURL("image/png"), "PNG", x, MARGIN, w, h);
    }

    const safe = company.name.replace(/[^\w\s-]/g, "").trim() || "company";
    const skin = variant === "dataroom-cool" ? "cool" : "warm";
    doc.save(`${safe} - Outreach One-Pager (${skin}).pdf`);
  } finally {
    root.unmount();
    host.remove();
  }
}
