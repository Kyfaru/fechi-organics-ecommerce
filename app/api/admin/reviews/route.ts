import { NextRequest } from "next/server"
import { connection } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, Err } from "@/lib/api"

// ---------------------------------------------------------------------------
// Auth helper — mirrors pattern in app/api/admin/orders/route.ts
// ---------------------------------------------------------------------------
async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user) return null
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { adminProfile: true },
  })
  return user?.role === "admin" ? user : null
}

// ---------------------------------------------------------------------------
// GET /api/admin/reviews
// Returns all user-submitted testimonials (reviews), newest first
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  await connection()
  try {
    const admin = await requireAdmin(req)
    if (!admin) return Err.forbidden()

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
    return Err.internal()
  }
}
