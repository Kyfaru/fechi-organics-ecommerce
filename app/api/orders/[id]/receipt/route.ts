import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { publishQstashJSON } from "@/lib/qstash";
import { assertTrustedOrigin } from "@/lib/origin-check";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const { id } = await params;

  try {
    const order = await db.order.findUnique({
      where: { id },
      select: { id: true, userId: true, paymentStatus: true, receiptSent: true },
    });
    if (!order) return Err.notFound("Order");
    if (order.userId !== session.user.id) return Err.forbidden();
    if (order.paymentStatus !== "PAID") return Err.validation("Receipt is only available for paid orders");

    if (!order.receiptSent) {
      await publishQstashJSON("/api/admin/workers/generate-invoice", { orderId: order.id });
    }

    return ok({ queued: !order.receiptSent });
  } catch (e) {
    console.error("[orders/:id/receipt] POST error", e);
    return Err.internal(e);
  }
}
