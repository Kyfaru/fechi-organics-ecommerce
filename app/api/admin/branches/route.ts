import { NextRequest, NextResponse } from "next/server"
import { connection } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, Err } from "@/lib/api"

async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user) return null
  const user = await db.user.findUnique({ where: { id: session.user.id } })
  return user?.role === "admin" ? user : null
}

export async function GET(req: NextRequest) {
  await connection()
  try {
    const admin = await requireAdmin(req)
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const branches = await db.branch.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, county: true, phone: true, isActive: true, mpesaType: true, shortcode: true },
    })
    return ok({ branches })
  } catch (e) {
    console.error("[admin/branches] GET error", e)
    return Err.internal()
  }
}
