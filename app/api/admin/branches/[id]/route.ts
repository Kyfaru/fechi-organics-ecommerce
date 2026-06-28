import { NextRequest } from "next/server"
import { connection } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, Err } from "@/lib/api"

async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user) return null
  const user = await db.user.findUnique({ where: { id: session.user.id } })
  return user?.role === "admin" ? user : null
}

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  county: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection()
  try {
    const admin = await requireAdmin(req)
    if (!admin) return Err.forbidden()
    const { id } = await params
    const body = await req.json()
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message)

    const data: Record<string, unknown> = {}
    if (parsed.data.name !== undefined) data.name = parsed.data.name
    if (parsed.data.county !== undefined) data.county = parsed.data.county
    if (parsed.data.phone !== undefined) data.phone = parsed.data.phone
    if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const branch = await db.branch.update({ where: { id }, data: data as any })
    return ok({ branch })
  } catch (e) {
    console.error("[admin/branches/[id]] PATCH error", e)
    return Err.internal()
  }
}
