import { NextRequest, NextResponse } from "next/server";
import { Err } from "@/lib/api";
import { getOrCreateInvoice } from "@/lib/invoice/get-or-create-invoice";
import { requirePermission } from "@/lib/require-permission";

// GET /api/admin/orders/[id]/invoice — redirects to the order's cached
// invoice PDF in R2, generating it on demand if the background job hasn't
// run yet (e.g. an admin clicks "Print Invoice" within the first minute).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await requirePermission(req, { orders: ["view"] });
    if (denied) return denied;

    const { id } = await params;
    const invoice = await getOrCreateInvoice(id);
    if (!invoice) return Err.notFound("Order");

    return NextResponse.redirect(invoice.url);
  } catch (e) {
    console.error("[admin/orders/[id]/invoice] GET error", e);
    return Err.internal(e);
  }
}
