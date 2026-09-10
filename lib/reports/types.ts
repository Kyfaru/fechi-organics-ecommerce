import { z } from "zod";

// Shared filter payload for both the Orders and Finance export modals.
// Money fields (priceMin/priceMax) are plain whole KES (matching the price
// slider's 10–100,000 KES range) — converted to the totalKes cents-unit
// convention only at query time.
export const exportFiltersSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  productIds: z.array(z.string()).optional(),
  orderStatuses: z.array(z.string()).optional(),
  paymentStatus: z.enum(["PAID", "PENDING", "FAILED"]).optional(),
  deliveryChannel: z.enum(["PICKUP", "DELIVERY", "INSTORE"]).optional(),
  customerMode: z.enum(["all", "custom"]).default("all"),
  customerIds: z.array(z.string()).optional(),
  priceMin: z.number().min(10).max(100_000).optional(),
  priceMax: z.number().min(10).max(100_000).optional(),
  format: z.enum(["pdf", "csv", "xml"]),
});
export type ExportFilters = z.infer<typeof exportFiltersSchema>;

// One row per order (online or in-store) — the common shape all three
// renderers (PDF/CSV/XML) consume, so "every cent accounted for" reads the
// same regardless of format.
export interface ReportRow {
  orderNumber: string;
  date: Date;
  customerName: string;
  customerContact: string;
  channel: "Store Pickup" | "Home Delivery" | "In-Store Walk-in";
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  itemsSummary: string;
  itemCount: number;
  subtotalKes: number;
  deliveryKes: number;
  discountKes: number;
  totalKes: number;
  branchName: string;
}

export interface ReportSummary {
  totalRevenueKes: number;
  orderCount: number;
  from: Date;
  to: Date;
  dailySeries: { date: string; amountKes: number }[];
}

export interface ReportData {
  rows: ReportRow[];
  summary: ReportSummary;
}
