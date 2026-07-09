/**
 * POST /api/payments/paystack/instore-webhook
 *
 * Paystack server-to-server webhook for in-store card payments. Structural
 * clone of app/api/payments/paystack/webhook/route.ts, retargeted at the
 * inStoreTransaction table (that file powers the customer checkout flow and
 * must not be touched or imported from). Verifies the HMAC signature then
 * marks the transaction as paid on charge.success. Always returns 200 once
 * the signature is valid so Paystack does not retry indefinitely.
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
import { markInStorePaymentSuccess } from "@/lib/payments/instore-post-payment";

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
  } catch {
    return Response.json({ ok: true }); // always 200
  }

  if (event.event !== "charge.success") {
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

    await markInStorePaymentSuccess({
      transactionId: tx.id,
      inStoreOrderId: tx.inStoreOrderId,
      transactionData: {
        status: "SUCCESS",
        paystackReference: reference,
        rawCallbackPayload: event.data as unknown as import("@prisma/client").Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    console.error("[paystack/instore-webhook] error", e);
    // still return 200 to Paystack
  }

  return Response.json({ ok: true });
}
