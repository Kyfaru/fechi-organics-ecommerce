import type { ReportData } from "@/lib/reports/types";

// Escape any field that might contain commas/quotes/newlines — same
// convention already used in app/api/admin/finance/export/route.ts.
function esc(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

const HEADER = [
  "Order #", "Date", "Time", "Customer", "Contact", "Channel", "Status", "Payment Status",
  "Payment Method", "Items", "Item Count", "Subtotal (KES)", "Delivery (KES)", "Discount (KES)",
  "Points Redeemed", "Points Value (KES)", "Total (KES)", "Branch",
];

export function renderCsv(data: ReportData): string {
  const lines = [HEADER.join(",")];
  for (const r of data.rows) {
    lines.push(
      [
        esc(r.orderNumber),
        r.date.toISOString().slice(0, 10),
        r.date.toISOString().slice(11, 16),
        esc(r.customerName),
        esc(r.customerContact),
        esc(r.channel),
        esc(r.status),
        esc(r.paymentStatus),
        esc(r.paymentMethod),
        esc(r.itemsSummary),
        String(r.itemCount),
        (r.subtotalKes / 100).toFixed(2),
        (r.deliveryKes / 100).toFixed(2),
        (r.discountKes / 100).toFixed(2),
        String(r.pointsRedeemed),
        (r.pointsDiscountKes / 100).toFixed(2),
        (r.totalKes / 100).toFixed(2),
        esc(r.branchName),
      ].join(","),
    );
  }
  // Trailing summary rows — same reconciliation figure the PDF/UI show, so a
  // reader can sanity-check the CSV total against the report header.
  lines.push("");
  lines.push(`Total orders,${data.summary.orderCount}`);
  lines.push(`Total revenue (KES),${(data.summary.totalRevenueKes / 100).toFixed(2)}`);
  // Points-funded value is NOT part of revenue above — it was already netted
  // out of each order's total. Listed separately so the two are never added.
  lines.push(`Points redeemed,${data.summary.totalPointsRedeemed}`);
  lines.push(`Points value (KES),${(data.summary.totalPointsValueKes / 100).toFixed(2)}`);
  return lines.join("\n");
}
