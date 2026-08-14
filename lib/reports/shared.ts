import type { ReportRow, ReportSummary } from "@/lib/reports/types";

const PROVIDER_LABELS: Record<string, string> = {
  MPESA: "M-Pesa",
  MPESA_STK: "M-Pesa",
  MPESA_C2B: "M-Pesa (Till)",
  PAYSTACK: "Paystack",
  KCB: "KCB",
};

interface TxLike {
  provider: string;
  status: string;
  mpesaReceiptNumber?: string | null;
  paystackReference?: string | null;
}

// Shared by both online orders (transaction[]) and in-store orders
// (inStoreTransaction[]) — same shape, different provider enum, both
// string-based so this reads either.
export function paymentMethodFromOnline(transactions: TxLike[]): string {
  const tx = transactions.find((t) => t.status === "SUCCESS") ?? transactions[0];
  if (!tx) return "—";
  const provider = PROVIDER_LABELS[tx.provider] ?? tx.provider;
  const ref = tx.mpesaReceiptNumber ?? tx.paystackReference;
  return ref ? `${provider} · ${ref}` : provider;
}

interface ItemLike {
  name: string;
  quantity: number;
  priceKes: number;
}

function summarizeItems(items: ItemLike[]): string {
  if (items.length === 0) return "—";
  return items.map((i) => `${i.quantity}x ${i.name} (KES ${(i.priceKes / 100).toLocaleString("en-KE")})`).join("; ");
}

export const itemsSummaryFromOnline = summarizeItems;
export const itemsSummaryFromInStore = summarizeItems;

export function buildSummary(rows: ReportRow[], from: Date, to: Date): ReportSummary {
  const totalRevenueKes = rows.reduce((s, r) => s + r.totalKes, 0);

  const dailyMap: Record<string, number> = {};
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 10);
    dailyMap[key] = (dailyMap[key] ?? 0) + r.totalKes;
  }
  const dailySeries = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amountKes]) => ({ date, amountKes }));

  return { totalRevenueKes, orderCount: rows.length, from, to, dailySeries };
}
