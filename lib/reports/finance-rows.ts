import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { ExportFilters, ReportData, ReportRow } from "@/lib/reports/types";
import { buildSummary, itemsSummaryFromOnline, itemsSummaryFromInStore, paymentMethodFromOnline } from "@/lib/reports/shared";

// Finance export — a ledger, so this is always PAID-only regardless of the
// paymentStatus filter (a "Finance" report about pending/failed money makes
// no sense as a revenue ledger; the paymentStatus filter here only narrows
// which PAID rows are pulled if a future need arises, but defaults to PAID).
// One row per order, not per transaction — a failed-then-succeeded retry is
// one sale, not two ledger lines.
export async function fetchFinanceReportRows(filters: ExportFilters): Promise<ReportData> {
  const from = new Date(filters.from);
  const to = new Date(filters.to);
  const includeOnline = filters.deliveryChannel !== "INSTORE";
  const includeInStore = filters.deliveryChannel !== "PICKUP" && filters.deliveryChannel !== "DELIVERY";

  const priceWhere: Prisma.orderWhereInput = {};
  if (filters.priceMin != null) priceWhere.totalKes = { ...(priceWhere.totalKes as object), gte: filters.priceMin * 100 };
  if (filters.priceMax != null) priceWhere.totalKes = { ...(priceWhere.totalKes as object), lte: filters.priceMax * 100 };

  const [onlineOrders, inStoreOrders] = await Promise.all([
    includeOnline
      ? db.order.findMany({
          where: {
            createdAt: { gte: from, lte: to },
            paymentStatus: "PAID",
            ...(filters.deliveryChannel === "PICKUP" ? { deliveryType: "PICKUP" } : {}),
            ...(filters.deliveryChannel === "DELIVERY" ? { deliveryType: "DELIVERY" } : {}),
            ...(filters.customerMode === "custom" && filters.customerIds?.length
              ? { userId: { in: filters.customerIds } }
              : {}),
            ...priceWhere,
          },
          select: {
            orderNumber: true,
            createdAt: true,
            status: true,
            paymentStatus: true,
            subtotalKes: true,
            deliveryKes: true,
            discountKes: true,
            pointsRedeemed: true,
            pointsDiscountKes: true,
            totalKes: true,
            deliveryType: true,
            guestEmail: true,
            deliveryPhone: true,
            user: { select: { name: true, email: true } },
            branch: { select: { name: true } },
            items: { select: { name: true, quantity: true, priceKes: true } },
            transactions: { select: { provider: true, status: true, mpesaReceiptNumber: true, paystackReference: true } },
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    includeInStore
      ? db.inStoreOrder.findMany({
          where: {
            createdAt: { gte: from, lte: to },
            paymentStatus: "PAID",
            ...(filters.customerMode === "custom" && filters.customerIds?.length
              ? { customerUserId: { in: filters.customerIds } }
              : {}),
            ...(filters.priceMin != null || filters.priceMax != null
              ? { totalKes: { gte: (filters.priceMin ?? 10) * 100, lte: (filters.priceMax ?? 100_000) * 100 } }
              : {}),
          },
          select: {
            orderNumber: true,
            createdAt: true,
            fulfillmentStatus: true,
            paymentStatus: true,
            subtotalKes: true,
            discountKes: true,
            pointsRedeemed: true,
            pointsDiscountKes: true,
            totalKes: true,
            deliveryKes: true,
            customerName: true,
            customerPhone: true,
            customerEmail: true,
            branch: { select: { name: true } },
            items: { select: { name: true, quantity: true, priceKes: true } },
            transactions: { select: { provider: true, status: true, mpesaReceiptNumber: true, paystackReference: true } },
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const rows: ReportRow[] = [
    ...onlineOrders.map((o): ReportRow => ({
      orderNumber: o.orderNumber ?? "—",
      date: o.createdAt,
      customerName: o.user?.name ?? "Guest",
      customerContact: o.user?.email ?? o.guestEmail ?? o.deliveryPhone ?? "—",
      channel: o.deliveryType === "PICKUP" ? "Store Pickup" : "Home Delivery",
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: paymentMethodFromOnline(o.transactions),
      itemsSummary: itemsSummaryFromOnline(o.items),
      itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
      subtotalKes: o.subtotalKes,
      deliveryKes: o.deliveryKes,
      discountKes: o.discountKes,
      pointsRedeemed: o.pointsRedeemed,
      pointsDiscountKes: o.pointsDiscountKes,
      totalKes: o.totalKes,
      branchName: o.branch?.name ?? "—",
    })),
    ...inStoreOrders.map((o): ReportRow => ({
      orderNumber: o.orderNumber ?? "—",
      date: o.createdAt,
      customerName: o.customerName ?? "Walk-in customer",
      customerContact: o.customerPhone ?? o.customerEmail ?? "—",
      channel: "In-Store Walk-in",
      status: o.fulfillmentStatus,
      paymentStatus: o.paymentStatus,
      paymentMethod: paymentMethodFromOnline(o.transactions),
      itemsSummary: itemsSummaryFromInStore(o.items),
      itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
      subtotalKes: o.subtotalKes,
      deliveryKes: o.deliveryKes,
      discountKes: o.discountKes,
      pointsRedeemed: o.pointsRedeemed,
      pointsDiscountKes: o.pointsDiscountKes,
      totalKes: o.totalKes,
      branchName: o.branch?.name ?? "—",
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  return { rows, summary: buildSummary(rows, from, to) };
}
