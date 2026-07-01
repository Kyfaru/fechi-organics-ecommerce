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

    const pickedUpAt = new Date()
    await db.order.update({
      where: { id: orderId },
      data: { status: "PICKED_UP", pickedUpAt },
    })
    await db.orderStatusEvent.create({ data: { orderId, status: "PICKED_UP", occurredAt: pickedUpAt } })

    // Schedule review reminder 4 days later
    await publishQstashJSON("/api/workers/review-reminder", { orderId, userId: session.user.id }, { delay: FOUR_DAYS_SECONDS })

    return ok({ pickedUpAt: pickedUpAt.toISOString() })
  } catch (e) {
    console.error("[orders/[id]/picked-up] POST error", e)
    return Err.internal()
  }
}
