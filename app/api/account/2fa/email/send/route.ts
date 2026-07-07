import { assertTrustedOrigin } from "@/lib/origin-check";
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { generateOtp, storeOtp } from "@/lib/otp"
import { sendOTPEmail } from "@/lib/email"

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    if (!session?.user) return NextResponse.json({ ok: false, error: { message: "Sign in required" } }, { status: 401 })

    const otp = generateOtp()
    await storeOtp(`2fa:otp:email:${session.user.id}`, otp, 600)

    await sendOTPEmail(session.user.email, otp, "2fa-setup")

    console.info("[2fa/email/send] OTP sent to", session.user.email)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[2fa/email/send] error", e)
    return NextResponse.json({ ok: false, error: { message: "Failed to send verification code" } }, { status: 500 })
  }
}
