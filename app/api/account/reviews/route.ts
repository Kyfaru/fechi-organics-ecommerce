import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, Err } from "@/lib/api"

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    if (!session) return Err.authRequired()
    const u = session.user

    const body = await req.json()
    const { orderId, rating, quote, title, isPublic, beforeDataUrl, afterDataUrl } = body

    if (!orderId || !rating || !quote) {
      return Err.validation("orderId, rating, and quote are required")
    }
    if (!isPublic) {
      return Err.validation("You must agree to the public review terms")
    }
    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      return Err.validation("rating must be between 1 and 5")
    }

    // Validate order ownership, status, and that it hasn't been reviewed yet
    const order = await db.order.findFirst({
      where: {
        id: orderId,
        userId: u.id,
        status: { in: ["DELIVERED", "PICKED_UP"] },
        reviewedAt: null,
      },
    })

    if (!order) {
      return Err.validation("Order not found or already reviewed")
    }

    await db.testimonial.create({
      data: {
        authorName: u.name ?? u.email,
        quote,
        rating,
        title: title ?? null,
        orderId,
        userId: u.id,
        // ponytail: data URL stored inline; migrate to R2 presigned upload when photo size matters
        beforeKey: (beforeDataUrl as string | undefined) ?? null,
        afterKey: (afterDataUrl as string | undefined) ?? null,
        approved: false,
      },
    })

    await db.order.update({
      where: { id: orderId },
      data: { reviewedAt: new Date() },
    })

    return ok({ success: true })
  } catch (e) {
    console.error("[account/reviews] POST error", e)
    return Err.internal()
  }
}
