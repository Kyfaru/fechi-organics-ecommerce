import { NextRequest } from "next/server"
import { connection } from "next/server"
import { db } from "@/lib/db"
import { ok, Err } from "@/lib/api"
import { requirePermission } from "@/lib/require-permission"

export async function GET(req: NextRequest) {
  await connection()
  try {
    const denied = await requirePermission(req, { branches: ["view"] })
    if (denied) return denied
    const branches = await db.branch.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, county: true, phone: true, isActive: true, mpesaType: true, shortcode: true },
    })
    return ok({ branches })
  } catch (e) {
    console.error("[admin/branches] GET error", e)
    return Err.internal(e)
  }
}
