import { assertTrustedOrigin } from "@/lib/origin-check";
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { verifyOtp } from "@/lib/otp"

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    if (!session?.user) return NextResponse.json({ ok: false, error: { message: "Sign in required" } }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const { otp } = body as { otp?: string }
    if (!otp || otp.length !== 6) {
      return NextResponse.json({ ok: false, error: { message: "Invalid OTP format" } }, { status: 400 })
    }

    const valid = await verifyOtp(`2fa:otp:phone:${session.user.id}`, otp)
    if (!valid) {
      return NextResponse.json({ ok: false, error: { message: "Invalid or expired code" } }, { status: 400 })
    }

    await db.user.update({
      where: { id: session.user.id },
      data: { twoFaPhone: true },
    })

    console.info("[2fa/phone/verify] Phone 2FA enabled for", session.user.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[2fa/phone/verify] error", e)
    return NextResponse.json({ ok: false, error: { message: "Verification failed" } }, { status: 500 })
  }
}
