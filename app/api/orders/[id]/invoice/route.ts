import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Err } from "@/lib/api";
import { getOrCreateInvoice } from "@/lib/invoice/get-or-create-invoice";

// GET /api/orders/[id]/invoice — redirects to the customer's cached invoice
// PDF in R2, generating it on demand if the background job hasn't run yet.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) return Err.authRequired();

    const { id } = await params;
    const order = await db.order.findFirst({
      where: { userId: session.user.id, OR: [{ id }, { orderNumber: decodeURIComponent(id) }] },
      select: { id: true, paymentStatus: true },
    });
    if (!order) return Err.notFound("Order");
    if (order.paymentStatus !== "PAID") return Err.validation("Invoice is only available for paid orders");

    const invoice = await getOrCreateInvoice(order.id);
    if (!invoice) return Err.notFound("Order");

    return NextResponse.redirect(invoice.url);
  } catch (e) {
    console.error("[orders/[id]/invoice] GET error", e);
    return Err.internal();
  }
}
