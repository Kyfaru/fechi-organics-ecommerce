import { assertTrustedOrigin } from "@/lib/origin-check";
import { NextRequest } from "next/server"
import { connection } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, Err } from "@/lib/api"
import { publishQstashJSON } from "@/lib/qstash"

const FOUR_DAYS_SECONDS = 4 * 24 * 60 * 60

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection()
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    if (!session) return Err.authRequired()

    const { id: orderId } = await params

    const order = await db.order.findFirst({
      where: { id: orderId, userId: session.user.id },
    })
    if (!order) return Err.notFound("Order")
    if (order.deliveryType !== "PICKUP") return Err.validation("This order is not a pickup order")
    if (order.status !== "READY_FOR_PICKUP") {
      return Err.validation("Order is not ready for pickup yet")
    }

    const now = new Date()
    // Dual confirmation: only transition to PICKED_UP once the staff side has
    // also confirmed (via the admin drawer) — mirrors the symmetric check on
    // the admin route so whichever party confirms second completes the order.
    const completed = order.staffPickupConfirmedAt !== null

    await db.order.update({
      where: { id: orderId },
      data: {
        customerPickupConfirmedAt: now,
        ...(completed ? { status: "PICKED_UP", pickedUpAt: now } : {}),
      },
    })

    if (completed) {
      await db.orderStatusEvent.create({ data: { orderId, status: "PICKED_UP", occurredAt: now } })

      // Schedule review reminder 4 days later
      await publishQstashJSON("/api/workers/review-reminder", { orderId, userId: session.user.id }, { delay: FOUR_DAYS_SECONDS })
    }

    return ok({
      customerPickupConfirmedAt: now.toISOString(),
      completed,
      pickedUpAt: completed ? now.toISOString() : null,
    })
  } catch (e) {
    console.error("[orders/[id]/picked-up] POST error", e)
    return Err.internal(e)
  }
}
