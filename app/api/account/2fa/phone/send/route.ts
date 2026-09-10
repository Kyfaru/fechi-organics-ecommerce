import { assertTrustedOrigin } from "@/lib/origin-check";
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { generateOtp, storeOtp } from "@/lib/otp"
import { sendSms, hasSmsConfig } from "@/lib/sms"
import { combineLegacyPhone } from "@/lib/phone"
import { reportError } from "@/lib/observability"

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    if (!session?.user) return NextResponse.json({ ok: false, error: { message: "Sign in required" } }, { status: 401 })

    const dbUser = await db.user.findUnique({ where: { id: session.user.id }, select: { phone: true, phoneCode: true } })
    const phone = dbUser?.phone ? combineLegacyPhone(dbUser.phone, dbUser.phoneCode) : null
    if (!phone) {
      return NextResponse.json({ ok: false, error: { message: "No phone number on your account. Add one in Profile settings." } }, { status: 400 })
    }

    if (!hasSmsConfig()) {
      console.error("[2fa/phone/send] SMS not configured — cannot send to", session.user.id)
      return NextResponse.json({ ok: false, error: { message: "SMS is not available right now. Try email instead." } }, { status: 503 })
    }

    const otp = generateOtp()
    await storeOtp(`2fa:otp:phone:${session.user.id}`, otp, 600)

    try {
      await sendSms(phone, `Your Fechi Organics 2FA code: ${otp}. Expires in 10 minutes.`)
    } catch (e) {
      reportError(e, { route: "POST /api/account/2fa/phone/send", tags: { flow: "account-2fa" } })
      console.error("[2fa/phone/send] SMS send failed for", session.user.id, e)
      return NextResponse.json({ ok: false, error: { message: "Failed to send SMS. Try email instead." } }, { status: 502 })
    }

    console.info("[2fa/phone/send] OTP sent to phone for", session.user.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[2fa/phone/send] error", e)
    reportError(e, { route: "POST /api/account/2fa/phone/send", tags: { flow: "account-2fa" } })
    return NextResponse.json({ ok: false, error: { message: "Failed to send SMS" } }, { status: 500 })
  }
}
