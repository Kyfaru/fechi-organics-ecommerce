/**
 * POST /api/payments/payhero/callback
 *
 * Webhook called by PayHero after a card payment completes or fails.
 * NOT authenticated — PayHero calls this directly.
 *
 * Always returns HTTP 200. Idempotency is enforced by checking transaction
 * status before applying any updates.
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";

function payHeroOk() {
  return Response.json({ status: "received" }, { status: 200 });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return payHeroOk();
  }

  try {
    const payload = body as Record<string, unknown>;

    // PayHero sends the order/external reference we set at initiation time.
    // We stored it as payheroReference on the transaction.
    const externalReference =
      (payload.external_reference as string | undefined) ??
      (payload.reference as string | undefined);

    if (!externalReference) {
      console.warn("[payhero/callback] Payload missing external_reference", payload);
      return payHeroOk();
    }

    // Look up by payheroReference first; fall back to orderId (external_reference = orderId)
    const transaction = await db.transaction.findFirst({
      where: {
        OR: [
          { payheroReference: externalReference },
          { orderId: externalReference, provider: "PAYHERO" },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    if (!transaction) {
      console.warn(`[payhero/callback] No transaction for reference: ${externalReference}`);
      return payHeroOk();
    }

    // Idempotency — skip already-processed transactions
    if (transaction.status !== "PENDING") {
      console.info(
        `[payhero/callback] Already processed — tx=${transaction.id} status=${transaction.status}`,
      );
      return payHeroOk();
    }

    // PayHero uses response_code "200" or status "SUCCESS" for success
    const responseCode = payload.response_code as string | undefined;
    const statusField = payload.status as string | undefined;
    const isSuccess =
      responseCode === "200" ||
      statusField === "SUCCESS" ||
      statusField === "success";

    const failureReason = isSuccess
      ? null
      : ((payload.message ?? payload.description ?? "Payment failed") as string);

    await db.$transaction([
      db.transaction.update({
        where: { id: transaction.id },
        data: {
          status: isSuccess ? "SUCCESS" : "FAILED",
          failureReason,
          rawCallbackPayload: payload as unknown as import("@prisma/client").Prisma.InputJsonValue,
        },
      }),
      db.order.update({
        where: { id: transaction.orderId },
        data: {
          paymentStatus: isSuccess ? "PAID" : "FAILED",
          status: isSuccess ? "CONFIRMED" : "PENDING",
        },
      }),
    ]);

    console.info(
      `[payhero/callback] Processed — tx=${transaction.id} success=${isSuccess}`,
    );
  } catch (e) {
    console.error("[payhero/callback] Processing error", e);
  }

  return payHeroOk();
}
