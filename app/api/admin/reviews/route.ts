import { NextRequest } from "next/server"
import { connection } from "next/server"
import { db } from "@/lib/db"
import { ok, Err } from "@/lib/api"
import { requirePermission } from "@/lib/require-permission"

// ---------------------------------------------------------------------------
// GET /api/admin/reviews
// Returns all user-submitted testimonials (reviews), newest first
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  await connection()

  const denied = await requirePermission(req, { reviews: ["view"] })
  if (denied) return denied

  try {
    const reviews = await db.testimonial.findMany({
      where: { userId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        authorName: true,
        quote: true,
        rating: true,
        title: true,
        approved: true,
        createdAt: true,
        orderId: true,
        userId: true,
        beforeKey: true,
        afterKey: true,
      },
    })

    return ok({ reviews })
  } catch (e) {
    console.error("[admin/reviews] GET error", e)
    return Err.internal(e)
  }
}
