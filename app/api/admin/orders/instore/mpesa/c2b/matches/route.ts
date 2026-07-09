/**
 * GET /api/admin/orders/instore/mpesa/c2b/matches?branchId=...&amount=...
 *
 * Returns unclaimed till/paybill payments logged by the Confirmation webhook
 * that match the given branch + exact amount (cents) within the last 10
 * minutes, newest first. The admin picks one of these to claim against the
 * order they're building (see /c2b/claim).
 *
 * The 10-minute lookback is the server-side bound on the matching window;
 * any client-side "give up after 20s" countdown is a separate, later
 * workstream's concern.
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";

const MATCH_WINDOW_MS = 10 * 60 * 1000;

async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { adminProfile: true },
  });
  return user?.role === "admin" ? user : null;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return Err.forbidden();

  const url = new URL(req.url);
  const branchId = url.searchParams.get("branchId");
  const amountRaw = url.searchParams.get("amount");
  const amount = amountRaw ? parseInt(amountRaw, 10) : NaN;

  if (!branchId || Number.isNaN(amount)) {
    return Err.validation("branchId and amount (integer cents) are required");
  }

  // Branch-scoped admins may only query their own branch.
  if (!admin.adminProfile?.isSuperAdmin && admin.adminProfile?.branchId !== branchId) {
    return Err.forbidden();
  }

  try {
    const rows = await db.mpesaC2bTransaction.findMany({
      where: {
        branchId,
        transAmount: amount,
        matchedInStoreTransactionId: null,
        transactionTime: { gte: new Date(Date.now() - MATCH_WINDOW_MS) },
      },
      orderBy: { transactionTime: "desc" },
      take: 5,
    });

    return ok({
      matches: rows.map((r) => ({
        id: r.id,
        transId: r.transId,
        transAmount: r.transAmount,
        payerName: [r.firstName, r.middleName, r.lastName].filter(Boolean).join(" ") || "Unknown",
        transactionTime: r.transactionTime,
      })),
    });
  } catch (e) {
    console.error("[instore/mpesa/c2b/matches] GET error", e);
    return Err.internal();
  }
}
