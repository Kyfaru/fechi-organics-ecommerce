import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import fs from "fs";
import path from "path";
import {
  GREEN, GOLD, GRAY_LINE, TEXT_DARK, TEXT_MUTED, STRIPE_TINT,
  MARGIN_X, PAGE_WIDTH, PAGE_HEIGHT, CONTENT_RIGHT, kes, fmtDate, fmtDateTime,
  COMPANY_PHONE, COMPANY_EMAIL, COMPANY_FOOTNOTE,
} from "@/lib/pdf/theme";
import type { ReportData } from "@/lib/reports/types";

let cachedLogoDataUri: string | null | undefined;

// jsPDF's addImage needs raster PNG/JPEG data, not the site's usual .webp
// logos — public/logo/email-logo-green.png is the one PNG variant that
// already exists for exactly this kind of non-browser rendering context.
function loadLogoDataUri(): string | null {
  if (cachedLogoDataUri !== undefined) return cachedLogoDataUri;
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), "public", "logo", "email-logo-green.png"));
    cachedLogoDataUri = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    cachedLogoDataUri = null;
  }
  return cachedLogoDataUri;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_HEIGHT - 25) {
    doc.addPage();
    return 20;
  }
  return y;
}

// Hand-drawn vector bar chart of the daily revenue series — deliberately not
// a rasterized chart-library render (html2canvas/Puppeteer/node-canvas):
// this pipeline runs in a serverless Next.js route, and a headless-browser
// or native-canvas dependency for one small chart is a disproportionate,
// fragile addition compared to ~30 lines of jsPDF primitives.
function drawTrendChart(doc: jsPDF, y: number, series: { date: string; amountKes: number }[]): number {
  const chartH = 40;
  const chartX = MARGIN_X;
  const chartW = CONTENT_RIGHT - MARGIN_X;
  const chartTop = y + 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...TEXT_DARK);
  doc.text("Revenue trend", MARGIN_X, y);

  if (series.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_MUTED);
    doc.text("No data in this range.", MARGIN_X, chartTop + 10);
    return chartTop + 20;
  }

  const max = Math.max(...series.map((s) => s.amountKes), 1);
  const barGap = 1.2;
  const barW = Math.max(1, (chartW - barGap * (series.length - 1)) / series.length);

  doc.setDrawColor(...GRAY_LINE);
  doc.setLineWidth(0.2);
  doc.line(chartX, chartTop + chartH, chartX + chartW, chartTop + chartH);

  series.forEach((point, i) => {
    const h = (point.amountKes / max) * chartH;
    const x = chartX + i * (barW + barGap);
    doc.setFillColor(...GREEN);
    doc.rect(x, chartTop + chartH - h, barW, h, "F");
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(series[0].date, chartX, chartTop + chartH + 5);
  doc.text(series[series.length - 1].date, chartX + chartW, chartTop + chartH + 5, { align: "right" });

  return chartTop + chartH + 12;
}

function drawStatsStrip(doc: jsPDF, y: number, data: ReportData): number {
  const stats: [string, string][] = [
    ["Total revenue", kes(data.summary.totalRevenueKes)],
    ["Total orders", String(data.summary.orderCount)],
    ["Date range", `${fmtDate(data.summary.from)} – ${fmtDate(data.summary.to)}`],
  ];
  const colW = (CONTENT_RIGHT - MARGIN_X) / stats.length;

  stats.forEach(([label, value], i) => {
    const x = MARGIN_X + i * colW;
    doc.setDrawColor(...GREEN);
    doc.setLineWidth(1.2);
    doc.line(x, y, x, y + 14);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...TEXT_DARK);
    doc.text(value, x + 4, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(label.toUpperCase(), x + 4, y + 12);
  });

  return y + 22;
}

export function renderExportReportPdf(
  data: ReportData,
  opts: { title: string; resource: "orders" | "finance" },
): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

  // ---- Letterhead -----------------------------------------------------
  const logo = loadLogoDataUri();
  let y = 18;
  if (logo) {
    doc.addImage(logo, "PNG", MARGIN_X, 10, 16, 16);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...GREEN);
  doc.text(opts.title, logo ? MARGIN_X + 20 : MARGIN_X, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(
    `Generated on ${fmtDateTime(new Date())} · covering ${fmtDate(data.summary.from)} – ${fmtDate(data.summary.to)}`,
    logo ? MARGIN_X + 20 : MARGIN_X,
    y + 6,
  );

  y = 34;
  doc.setDrawColor(...GRAY_LINE);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_X, y, CONTENT_RIGHT, y);
  y += 8;

  // ---- Stats strip ------------------------------------------------------
  y = drawStatsStrip(doc, y, data);

  // ---- Order-level ledger table ------------------------------------------
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN_X, right: MARGIN_X, bottom: 25 },
    head: [["Order #", "Date", "Customer", "Items", "Method", "Channel", "Amount"]],
    body: data.rows.map((r) => [
      r.orderNumber,
      fmtDateTime(r.date),
      r.customerName,
      r.itemsSummary.length > 60 ? `${r.itemsSummary.slice(0, 57)}…` : r.itemsSummary,
      r.paymentMethod,
      r.channel,
      kes(r.totalKes),
    ]),
    styles: { font: "helvetica", fontSize: 7.5, textColor: TEXT_DARK, cellPadding: 2 },
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: STRIPE_TINT },
    columnStyles: {
      6: { halign: "right" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 12;

  // ---- Trend chart --------------------------------------------------------
  y = ensureSpace(doc, y, 60);
  y = drawTrendChart(doc, y, data.summary.dailySeries);

  // ---- Reconciliation total (repeated) -------------------------------------
  y = ensureSpace(doc, y, 20);
  doc.setDrawColor(...GRAY_LINE);
  doc.line(MARGIN_X, y, CONTENT_RIGHT, y);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...GREEN);
  doc.text("TOTAL REVENUE", MARGIN_X, y);
  doc.text(kes(data.summary.totalRevenueKes), CONTENT_RIGHT, y, { align: "right" });

  // ---- Footer on every page -------------------------------------------------
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.8);
    doc.line(MARGIN_X, PAGE_HEIGHT - 18, CONTENT_RIGHT, PAGE_HEIGHT - 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`Fechi Organics · ${COMPANY_PHONE} · ${COMPANY_EMAIL}`, MARGIN_X, PAGE_HEIGHT - 12);
    doc.text(COMPANY_FOOTNOTE, MARGIN_X, PAGE_HEIGHT - 8);
    doc.text(`Page ${p} of ${pageCount}`, CONTENT_RIGHT, PAGE_HEIGHT - 8, { align: "right" });
  }

  return Buffer.from(doc.output("arraybuffer"));
}
