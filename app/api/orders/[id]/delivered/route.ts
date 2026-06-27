import { NextRequest } from "next/server"
import { connection } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, Err } from "@/lib/api"

// POST /api/orders/[id]/delivered
// Allows the authenticated customer to mark their own SHIPPED order as DELIVERED.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection()
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    if (!session?.user) return Err.authRequired()

    const { id } = await params

    const order = await db.order.findUnique({ where: { id } })
    if (!order) return Err.notFound("Order")
    if (order.userId !== session.user.id) return Err.forbidden()

    if (order.deliveryType === "PICKUP") {
      return Err.validation("Pickup orders cannot be marked as delivered")
    }
    if (order.status !== "SHIPPED") {
      return Err.validation(`Order must be SHIPPED to mark as delivered (current: ${order.status})`)
    }

    const updated = await db.order.update({
      where: { id },
      data: { status: "DELIVERED" },
      select: { id: true, status: true },
    })

    // Send inbox notification (fire-and-forget)
    if (order.userId) {
      const orderRef = order.orderNumber ?? `#FO-${id.slice(0, 8).toUpperCase()}`
      Promise.resolve().then(async () => {
        try {
          await db.inboxMessage.create({
            data: {
              userId: order.userId!,
              type: "ORDER_UPDATE",
              title: `Order ${orderRef} — Delivered`,
              body: `You've confirmed receipt of your order ${orderRef}. We hope you love your products!`,
              orderId: id,
            },
          })
        } catch (e) {
          console.error("[delivered] inbox create failed:", e)
        }
      })
    }

    console.info("[orders/[id]/delivered] POST —", id, "→ DELIVERED")
    return ok({ order: updated })
  } catch (e) {
    console.error("[orders/[id]/delivered] POST error", e)
    return Err.internal()
  }
}
