/**
 * POST /api/payments/paystack/webhook
 *
 * Paystack server-to-server webhook. Verifies the HMAC signature then marks
 * the transaction as paid on charge.success. Always returns 200 once the
 * signature is valid so Paystack does not retry indefinitely.
 */

import { NextRequest } from "next/server";
import { createHmac } from "crypto";
import { db } from "@/lib/db";
import { markPaymentSuccess } from "@/lib/payments/post-payment";

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
    const tx = await db.transaction.findFirst({
      where: { paystackReference: reference },
      include: { order: { select: { id: true } } },
    });

    if (!tx) return Response.json({ ok: true });
    if (tx.status !== "PENDING") return Response.json({ ok: true }); // idempotency

    await markPaymentSuccess({
      transactionId: tx.id,
      orderId: tx.order.id,
      transactionData: {
        status: "SUCCESS",
        paystackReference: reference,
        rawCallbackPayload: event.data as unknown as import("@prisma/client").Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    console.error("[paystack/webhook] error", e);
    // still return 200 to Paystack
  }

  return Response.json({ ok: true });
}
