import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    if (!session?.user) return NextResponse.json({ ok: false, error: { message: "Sign in required" } }, { status: 401 })

    const twoFactor = await db.twoFactor.findFirst({
      where: { userId: session.user.id },
      select: { backupCodes: true },
    })

    if (!twoFactor) {
      return NextResponse.json({ ok: true, codes: [] })
    }

    let codes: string[] = []
    try {
      codes = JSON.parse(twoFactor.backupCodes) as string[]
    } catch {
      codes = []
    }

    return NextResponse.json({ ok: true, codes })
  } catch (e) {
    console.error("[2fa/backup-codes] GET error", e)
    return NextResponse.json({ ok: false, error: { message: "Failed to load backup codes" } }, { status: 500 })
  }
}
