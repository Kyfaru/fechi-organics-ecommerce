import type { ReportData } from "@/lib/reports/types";

// Flat tabular data doesn't need a real XML library's attribute/namespace
// machinery — template strings with basic entity-escaping are sufficient.
function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderXml(data: ReportData): string {
  const rows = data.rows
    .map(
      (r) => `  <order>
    <orderNumber>${esc(r.orderNumber)}</orderNumber>
    <date>${r.date.toISOString()}</date>
    <customerName>${esc(r.customerName)}</customerName>
    <customerContact>${esc(r.customerContact)}</customerContact>
    <channel>${esc(r.channel)}</channel>
    <status>${esc(r.status)}</status>
    <paymentStatus>${esc(r.paymentStatus)}</paymentStatus>
    <paymentMethod>${esc(r.paymentMethod)}</paymentMethod>
    <items>${esc(r.itemsSummary)}</items>
    <itemCount>${r.itemCount}</itemCount>
    <subtotalKes>${(r.subtotalKes / 100).toFixed(2)}</subtotalKes>
    <deliveryKes>${(r.deliveryKes / 100).toFixed(2)}</deliveryKes>
    <discountKes>${(r.discountKes / 100).toFixed(2)}</discountKes>
    <totalKes>${(r.totalKes / 100).toFixed(2)}</totalKes>
    <branch>${esc(r.branchName)}</branch>
  </order>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<report>
  <meta>
    <generatedAt>${new Date().toISOString()}</generatedAt>
    <from>${data.summary.from.toISOString()}</from>
    <to>${data.summary.to.toISOString()}</to>
    <orderCount>${data.summary.orderCount}</orderCount>
    <totalRevenueKes>${(data.summary.totalRevenueKes / 100).toFixed(2)}</totalRevenueKes>
  </meta>
  <orders>
${rows}
  </orders>
</report>
`;
}
