import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import fs from "fs";
import path from "path";
import {
  GREEN, GOLD, GRAY_LINE, TEXT_DARK, TEXT_MUTED, STRIPE_TINT,
  MARGIN_X, PAGE_HEIGHT, CONTENT_RIGHT, kes, fmtDate, fmtDateTime,
  COMPANY_PHONE, COMPANY_EMAIL, COMPANY_FOOTNOTE,
} from "@/lib/pdf/theme";
import type { ReportData, ReportRow } from "@/lib/reports/types";
import { getConversionSummaryForWindow, type ConversionResult } from "@/lib/stats/conversion";

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

function pageHeading(doc: jsPDF, title: string, subtitle: string): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...GREEN);
  doc.text(title, MARGIN_X, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(subtitle, MARGIN_X, 26);
  doc.setDrawColor(...GRAY_LINE);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_X, 30, CONTENT_RIGHT, 30);
  return 38;
}

// Hand-drawn vector bar chart — deliberately not a rasterized chart-library
// render (html2canvas/Puppeteer/node-canvas): this pipeline runs in a
// serverless Next.js route, and a headless-browser or native-canvas
// dependency for a few small charts is a disproportionate, fragile addition
// compared to a few dozen lines of jsPDF primitives.
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

// Compact labelled bar chart for a half-width column — used for the page-2
// 2-column channel/order-count pair.
function drawSmallBarChart(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  title: string,
  bars: { label: string; value: number }[],
  color: [number, number, number],
  fmt: (v: number) => string,
): number {
  const chartH = 32;
  const chartTop = y + 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_DARK);
  doc.text(title, x, y);

  if (bars.length === 0 || bars.every((b) => b.value === 0)) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text("No data.", x, chartTop + 10);
    return chartTop + 18;
  }

  const max = Math.max(...bars.map((b) => b.value), 1);
  const barGap = 4;
  const barW = Math.max(4, (w - barGap * (bars.length - 1)) / bars.length);

  doc.setDrawColor(...GRAY_LINE);
  doc.setLineWidth(0.2);
  doc.line(x, chartTop + chartH, x + w, chartTop + chartH);

  bars.forEach((b, i) => {
    const h = (b.value / max) * chartH;
    const bx = x + i * (barW + barGap);
    doc.setFillColor(...color);
    doc.rect(bx, chartTop + chartH - h, barW, h, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(b.label, bx + barW / 2, chartTop + chartH + 5, { align: "center", maxWidth: barW + barGap });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_DARK);
    doc.text(fmt(b.value), bx + barW / 2, chartTop + chartH - h - 2, { align: "center" });
  });

  return chartTop + chartH + 14;
}

function drawStatsStrip(doc: jsPDF, y: number, stats: [string, string][]): number {
  const colW = (CONTENT_RIGHT - MARGIN_X) / stats.length;

  stats.forEach(([label, value], i) => {
    const x = MARGIN_X + i * colW;
    doc.setDrawColor(...GREEN);
    doc.setLineWidth(1.2);
    doc.line(x, y, x, y + 14);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...TEXT_DARK);
    doc.text(value, x + 4, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(label.toUpperCase(), x + 4, y + 12, { maxWidth: colW - 6 });
  });

  return y + 22;
}

// ---------------------------------------------------------------------------
// Channel breakdown — derived from ReportRow.channel, no extra queries needed.
// ---------------------------------------------------------------------------
function channelBreakdown(rows: ReportRow[]): { channel: string; orders: number; revenueKes: number }[] {
  const map = new Map<string, { orders: number; revenueKes: number }>();
  for (const r of rows) {
    const existing = map.get(r.channel) ?? { orders: 0, revenueKes: 0 };
    existing.orders += 1;
    existing.revenueKes += r.totalKes;
    map.set(r.channel, existing);
  }
  return [...map.entries()].map(([channel, v]) => ({ channel, ...v }));
}

function paymentMethodBreakdown(rows: ReportRow[]): { method: string; orders: number; revenueKes: number }[] {
  const map = new Map<string, { orders: number; revenueKes: number }>();
  for (const r of rows) {
    const existing = map.get(r.paymentMethod) ?? { orders: 0, revenueKes: 0 };
    existing.orders += 1;
    existing.revenueKes += r.totalKes;
    map.set(r.paymentMethod, existing);
  }
  return [...map.entries()].map(([method, v]) => ({ method, ...v }));
}

// ---------------------------------------------------------------------------
// Page 1 — Executive overview
// ---------------------------------------------------------------------------
function renderOverviewPage(doc: jsPDF, opts: { title: string }, data: ReportData): void {
  const logo = loadLogoDataUri();
  let y = 18;
  if (logo) doc.addImage(logo, "PNG", MARGIN_X, 10, 16, 16);
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

  y = drawStatsStrip(doc, y, [
    ["Total revenue", kes(data.summary.totalRevenueKes)],
    ["Total orders", String(data.summary.orderCount)],
    ["Date range", `${fmtDate(data.summary.from)} – ${fmtDate(data.summary.to)}`],
  ]);
  y += 6;
  drawTrendChart(doc, y, data.summary.dailySeries);
}

// ---------------------------------------------------------------------------
// Page 2 — Channel/order detail
// ---------------------------------------------------------------------------
function renderChannelDetailPage(doc: jsPDF, data: ReportData): void {
  let y = pageHeading(doc, "Channel & Order Detail", "Home delivery, store pickup and in-store walk-in orders");

  const channels = channelBreakdown(data.rows);
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN_X, right: MARGIN_X },
    head: [["Channel", "Orders", "Revenue", "Share"]],
    body: channels.map((c) => [
      c.channel,
      String(c.orders),
      kes(c.revenueKes),
      data.summary.totalRevenueKes > 0 ? `${Math.round((c.revenueKes / data.summary.totalRevenueKes) * 1000) / 10}%` : "—",
    ]),
    styles: { font: "helvetica", fontSize: 8.5, textColor: TEXT_DARK, cellPadding: 2 },
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
    alternateRowStyles: { fillColor: STRIPE_TINT },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 10;

  // 2-column charts: revenue by channel, orders by channel
  const colW = (CONTENT_RIGHT - MARGIN_X - 10) / 2;
  const chartBottomLeft = drawSmallBarChart(
    doc, MARGIN_X, y, colW, "Revenue by channel",
    channels.map((c) => ({ label: c.channel, value: c.revenueKes / 100 })),
    GREEN, (v) => `${Math.round(v / 1000)}K`,
  );
  const chartBottomRight = drawSmallBarChart(
    doc, MARGIN_X + colW + 10, y, colW, "Orders by channel",
    channels.map((c) => ({ label: c.channel, value: c.orders })),
    GOLD, (v) => String(v),
  );
  y = Math.max(chartBottomLeft, chartBottomRight) + 4;

  // Order-level ledger table
  y = ensureSpace(doc, y, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...TEXT_DARK);
  doc.text("Order ledger", MARGIN_X, y);
  y += 4;

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
    columnStyles: { 6: { halign: "right" } },
  });
}

// ---------------------------------------------------------------------------
// Page 3, orders/general variant — marketing / social-channel conversion
// ---------------------------------------------------------------------------
function renderConversionPage(doc: jsPDF, conversion: ConversionResult[]): void {
  const y0 = pageHeading(doc, "Marketing & Conversion", "Paid orders ÷ carts, by last-touch social channel");
  const labels: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", google: "Google", tiktok: "TikTok", other: "Other" };

  autoTable(doc, {
    startY: y0,
    margin: { left: MARGIN_X, right: MARGIN_X },
    head: [["Channel", "Carts", "Orders", "Revenue", "Conversion Rate"]],
    body: conversion.map((c) => [
      labels[c.source] ?? c.source,
      String(c.carts),
      String(c.orders),
      kes(c.revenue),
      `${c.conversionRate.toFixed(1)}%`,
    ]),
    styles: { font: "helvetica", fontSize: 9, textColor: TEXT_DARK, cellPadding: 2.5 },
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: STRIPE_TINT },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const y = ((doc as any).lastAutoTable?.finalY ?? y0 + 20) + 10;

  drawSmallBarChart(
    doc, MARGIN_X, y, CONTENT_RIGHT - MARGIN_X, "Conversion rate by channel",
    conversion.map((c) => ({ label: labels[c.source] ?? c.source, value: c.conversionRate })),
    GREEN, (v) => `${v.toFixed(1)}%`,
  );
}

// ---------------------------------------------------------------------------
// Page 3, finance variant — transactions detail
// ---------------------------------------------------------------------------
function renderTransactionsDetailPage(doc: jsPDF, data: ReportData): void {
  const y0 = pageHeading(doc, "Transactions Detail", "Payment method breakdown and expected-transactions baseline");

  const days = Math.max(1, Math.round((data.summary.to.getTime() - data.summary.from.getTime()) / 86_400_000) + 1);
  const expected = Math.round((1000 / 30) * days);
  let y = drawStatsStrip(doc, y0, [
    ["Total transactions", String(data.rows.length)],
    ["Expected (1000/mo baseline)", String(expected)],
    ["% of expected", expected > 0 ? `${Math.round((data.rows.length / expected) * 1000) / 10}%` : "—"],
  ]);
  y += 6;

  const methods = paymentMethodBreakdown(data.rows);
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN_X, right: MARGIN_X },
    head: [["Method", "Transactions", "Revenue", "Share"]],
    body: methods.map((m) => [
      m.method,
      String(m.orders),
      kes(m.revenueKes),
      data.summary.totalRevenueKes > 0 ? `${Math.round((m.revenueKes / data.summary.totalRevenueKes) * 1000) / 10}%` : "—",
    ]),
    styles: { font: "helvetica", fontSize: 8.5, textColor: TEXT_DARK, cellPadding: 2 },
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
    alternateRowStyles: { fillColor: STRIPE_TINT },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableEnd = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 10;

  drawSmallBarChart(
    doc, MARGIN_X, tableEnd, CONTENT_RIGHT - MARGIN_X, "Revenue by payment method",
    methods.map((m) => ({ label: m.method, value: m.revenueKes / 100 })),
    GOLD, (v) => `${Math.round(v / 1000)}K`,
  );
}

function drawFooters(doc: jsPDF): void {
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
}

/**
 * 3-page report: (1) executive overview, (2) channel/order detail, (3)
 * marketing/conversion for the "orders" (general) resource, or transactions
 * detail for "finance". Each section is a fixed page — no natural-overflow
 * pagination between sections (the order ledger table on page 2 can still
 * overflow onto extra pages if it's long; the footer loop covers however
 * many pages jsPDF ends up with).
 */
export async function renderExportReportPdf(
  data: ReportData,
  opts: { title: string; resource: "orders" | "finance" },
): Promise<Buffer> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

  renderOverviewPage(doc, opts, data);

  doc.addPage();
  renderChannelDetailPage(doc, data);

  doc.addPage();
  if (opts.resource === "finance") {
    renderTransactionsDetailPage(doc, data);
  } else {
    const conversion = await getConversionSummaryForWindow(data.summary.from, data.summary.to, "daily");
    renderConversionPage(doc, conversion);
  }

  drawFooters(doc);

  return Buffer.from(doc.output("arraybuffer"));
}
