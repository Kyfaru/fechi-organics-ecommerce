import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Err } from "@/lib/api";
import { getOrCreateInStoreInvoice } from "@/lib/invoice/get-or-create-instore-invoice";
import { requirePermission } from "@/lib/require-permission";

// ---------------------------------------------------------------------------
// GET /api/admin/orders/instore/[id]/invoice — redirects to the in-store
// order's cached invoice PDF in R2, generating it on demand if needed.
// Mirrors app/api/orders/[id]/invoice/route.ts's redirect pattern, but with
// admin auth + branch scoping instead of a customer session, and only
// allows the redirect once the order is paid (same behaviour as the
// customer route) — simplest and safest, even though an admin might
// reasonably want to preview an invoice before payment.
// ---------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const denied = await requirePermission(req, { orders: ["view"] });
    if (denied) return denied;

    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return Err.authRequired();

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      include: { adminProfile: true },
    });
    if (!user) return Err.authRequired();

    const { id } = await params;

    const order = await db.inStoreOrder.findUnique({
      where: { id },
      select: { id: true, branchId: true, paymentStatus: true },
    });
    if (!order) return Err.notFound("Order");

    // Branch-scoped admins may only view invoices for their own branch's
    // in-store orders.
    if (!user.adminProfile?.isSuperAdmin && user.adminProfile?.branchId !== order.branchId) {
      return Err.forbidden();
    }

    if (order.paymentStatus !== "PAID") return Err.validation("Invoice is only available for paid orders");

    const invoice = await getOrCreateInStoreInvoice(order.id);
    if (!invoice) return Err.notFound("Order");

    return NextResponse.redirect(invoice.url);
  } catch (e) {
    console.error("[admin/orders/instore/[id]/invoice] GET error", e);
    return Err.internal(e);
  }
}
