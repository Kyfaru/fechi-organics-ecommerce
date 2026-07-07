import { assertTrustedOrigin } from "@/lib/origin-check";
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { generateOtp, storeOtp } from "@/lib/otp"
import { sendSms } from "@/lib/twilio"

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    if (!session?.user) return NextResponse.json({ ok: false, error: { message: "Sign in required" } }, { status: 401 })

    const dbUser = await db.user.findUnique({ where: { id: session.user.id }, select: { phone: true } })
    if (!dbUser?.phone) {
      return NextResponse.json({ ok: false, error: { message: "No phone number on your account. Add one in Profile settings." } }, { status: 400 })
    }

    const otp = generateOtp()
    await storeOtp(`2fa:otp:phone:${session.user.id}`, otp, 600)

    const hasTwilio = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER)
    if (hasTwilio) {
      await sendSms(dbUser.phone, `Your Fechi Organics 2FA code: ${otp}. Expires in 10 minutes.`)
    } else {
      console.warn("[2fa/phone/send] Twilio not configured — OTP:", otp)
    }

    console.info("[2fa/phone/send] OTP sent to phone for", session.user.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[2fa/phone/send] error", e)
    return NextResponse.json({ ok: false, error: { message: "Failed to send SMS" } }, { status: 500 })
  }
}
