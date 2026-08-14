/**
 * POST /api/payments/paystack/instore-webhook
 *
 * Paystack server-to-server webhook for in-store card payments. Structural
 * clone of app/api/payments/paystack/webhook/route.ts, retargeted at the
 * inStoreTransaction table (that file powers the customer checkout flow and
 * must not be touched or imported from). Verifies the HMAC signature then
 * marks the transaction as paid on charge.success, or failed on charge.failed
 * (the only terminal non-success event Paystack sends for a one-off inline
 * card charge — see the handler below for what else was considered and
 * excluded). Always returns 200 once the signature is valid so Paystack does
 * not retry indefinitely.
 *
 * NOTE: Paystack's dashboard only supports one webhook URL per account, so
 * actually wiring this second URL up (in addition to the customer webhook)
 * is a manual dashboard configuration step outside this codebase — same
 * category of external step as the Daraja C2B URL registration. Nothing to
 * solve in code here.
 */

import { NextRequest } from "next/server";
import { createHmac } from "crypto";
import { db } from "@/lib/db";
import { markInStorePaymentSuccess, markInStorePaymentFailed } from "@/lib/payments/instore-post-payment";
import { reportError } from "@/lib/observability";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("x-paystack-signature");
  const expected = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY ?? "")
    .update(rawBody)
    .digest("hex");

  if (sig !== expected) {
    return Response.json({ ok: false }, { status: 401 });
  }

  let event: { event: string; data: { reference: string; status: string; gateway_response: string } };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch (parseErr) {
    reportError(parseErr, { route: "POST /api/payments/paystack/instore-webhook", tags: { stage: "body_parse" } });
    return Response.json({ ok: true }); // always 200
  }

  // Terminal outcomes for a one-off inline card charge (this route never
  // deals with subscriptions/invoices/transfers, so those event families are
  // out of scope). charge.failed is Paystack's single terminal
  // non-success event for a card charge — declines, insufficient funds,
  // invalid card, and issuer timeouts all surface as charge.failed, not a
  // distinct event each. charge.dispute.* fires after a charge already
  // succeeded (a chargeback), so it's not a "did the charge fail" signal and
  // is deliberately excluded here.
  if (event.event !== "charge.success" && event.event !== "charge.failed") {
    return Response.json({ ok: true });
  }

  try {
    const reference = event.data.reference;
    const tx = await db.inStoreTransaction.findFirst({
      where: { paystackReference: reference },
      select: { id: true, inStoreOrderId: true, status: true },
    });

    if (!tx) return Response.json({ ok: true });
    if (tx.status !== "PENDING") return Response.json({ ok: true }); // idempotency

    if (event.event === "charge.success") {
      await markInStorePaymentSuccess({
        transactionId: tx.id,
        inStoreOrderId: tx.inStoreOrderId,
        transactionData: {
          status: "SUCCESS",
          paystackReference: reference,
          rawCallbackPayload: event.data as unknown as import("@prisma/client").Prisma.InputJsonValue,
        },
      });
    } else {
      await markInStorePaymentFailed({
        transactionId: tx.id,
        inStoreOrderId: tx.inStoreOrderId,
        reason: event.data.gateway_response || "Card charge declined",
      });
    }
  } catch (e) {
    reportError(e, { route: "POST /api/payments/paystack/instore-webhook", tags: { stage: "handler" } });
    console.error("[paystack/instore-webhook] error", e);
    // still return 200 to Paystack
  }

  return Response.json({ ok: true });
}
