import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Err } from "@/lib/api";
import { getOrCreateInvoice } from "@/lib/invoice/get-or-create-invoice";

// Auth helper — matches pattern in /api/admin/orders/[id]/route.ts
async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  return user?.role === "admin" ? user : null;
}

// GET /api/admin/orders/[id]/invoice — redirects to the order's cached
// invoice PDF in R2, generating it on demand if the background job hasn't
// run yet (e.g. an admin clicks "Print Invoice" within the first minute).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const { id } = await params;
    const invoice = await getOrCreateInvoice(id);
    if (!invoice) return Err.notFound("Order");

    return NextResponse.redirect(invoice.url);
  } catch (e) {
    console.error("[admin/orders/[id]/invoice] GET error", e);
    return Err.internal();
  }
}
