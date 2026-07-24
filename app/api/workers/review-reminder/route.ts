import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { verifyQstashRequest } from "@/lib/qstash"
import { sendSms, hasSmsConfig } from "@/lib/sms"
import { combineLegacyPhone } from "@/lib/phone"
import { Resend } from "resend"
import { emailShell, emailSection, emailButton, emailIconCircle, EMAIL_BRAND, FONT_HEADING } from "@/lib/email-template"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const sig = req.headers.get("upstash-signature")
    const valid = await verifyQstashRequest(sig, body)
    if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 })

    const { orderId, userId } = JSON.parse(body) as { orderId: string; userId: string }

    const order = await db.order.findFirst({
      where: { id: orderId, userId },
      include: { user: { select: { name: true, email: true, phone: true, phoneCode: true } } },
    })
    if (!order || order.reviewedAt) return NextResponse.json({ ok: true })

    const orderRef = order.orderNumber ?? `#FO-${orderId.slice(0, 8).toUpperCase()}`
    const user = order.user
    const msg = `How was your Fechi Organics order ${orderRef}? Share your experience — your review helps others make better choices!`

    // Inbox message
    await db.inboxMessage.create({
      data: {
        userId,
        type: "SYSTEM",
        title: `How was order ${orderRef}? Leave a review!`,
        body: msg,
        orderId,
      },
    })

    // SMS
    const phone = user?.phone ? combineLegacyPhone(user.phone, user.phoneCode) : null
    if (hasSmsConfig() && phone) {
      await sendSms(phone, `${msg} Visit ${process.env.NEXT_PUBLIC_APP_URL}/account/reviews/${orderId}`).catch((e) =>
        console.error("[review-reminder] SMS failed:", e)
      )
    }

    // Email
    if (user?.email && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
      const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL}/account/reviews/${orderId}`
      const sections = [
        emailSection(`
          ${emailIconCircle("gift")}
          <h1 style="margin:0 0 16px;text-align:center;font-family:${FONT_HEADING};font-size:24px;font-weight:700;color:${EMAIL_BRAND.textDark};">How Was Order ${orderRef}?</h1>
          <p style="margin:0 0 8px;font-size:15px;color:${EMAIL_BRAND.textBody};line-height:1.6;">Hi ${user?.name ?? "there"},</p>
          <p style="margin:0 0 28px;font-size:15px;color:${EMAIL_BRAND.textBody};line-height:1.6;">${msg}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td>${emailButton("Write a Review", reviewUrl)}</td></tr></table>
        `),
      ].join("")

      await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: user.email,
        subject: `How was your Fechi Organics order ${orderRef}?`,
        html: emailShell({ title: `How was order ${orderRef}?`, sectionsHtml: sections }),
      }).catch((e) => console.error("[review-reminder] email failed:", e))
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[review-reminder] error", e)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
