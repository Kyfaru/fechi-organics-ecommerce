/**
 * GET /api/invoices/instore/[token]
 *
 * Public, unauthenticated PDF download link texted to walk-in customers as
 * their in-store receipt. Auth is the possession of a valid signed token
 * (see lib/invoice-token.ts) rather than a session — the recipient never
 * logs in.
 */

import { verifyInstoreInvoiceToken } from "@/lib/invoice-token";
import { getOrCreateInStoreInvoice } from "@/lib/invoice/get-or-create-instore-invoice";
import { reportError } from "@/lib/observability";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const verified = await verifyInstoreInvoiceToken(token);
  if (!verified) return new Response("Not found", { status: 404 });

  try {
    const invoice = await getOrCreateInStoreInvoice(verified.inStoreOrderId);
    if (!invoice) return new Response("Not found", { status: 404 });

    return new Response(new Uint8Array(invoice.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.invoiceNumber}.pdf"`,
      },
    });
  } catch (e) {
    reportError(e, { route: "GET /api/invoices/instore/[token]", extra: { inStoreOrderId: verified.inStoreOrderId } });
    console.error("[invoices/instore/[token]] GET error", e);
    return new Response("Internal error", { status: 500 });
  }
}
