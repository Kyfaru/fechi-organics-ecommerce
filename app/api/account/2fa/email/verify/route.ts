import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getRedis } from "@/lib/redis"

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    if (!session?.user) return NextResponse.json({ ok: false, error: { message: "Sign in required" } }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const { otp } = body as { otp?: string }
    if (!otp || otp.length !== 6) {
      return NextResponse.json({ ok: false, error: { message: "Invalid OTP format" } }, { status: 400 })
    }

    const redis = getRedis()
    const stored = await redis.get(`2fa:otp:email:${session.user.id}`)
    if (!stored || stored !== otp) {
      return NextResponse.json({ ok: false, error: { message: "Invalid or expired code" } }, { status: 400 })
    }

    await db.user.update({
      where: { id: session.user.id },
      data: { twoFaEmail: true },
    })

    // Invalidate the OTP
    await redis.set(`2fa:otp:email:${session.user.id}`, "", { ex: 1 })

    console.info("[2fa/email/verify] Email 2FA enabled for", session.user.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[2fa/email/verify] error", e)
    return NextResponse.json({ ok: false, error: { message: "Verification failed" } }, { status: 500 })
  }
}
