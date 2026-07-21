import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { verifyQstashRequest } from "@/lib/qstash"
import { sendSms, hasSmsConfig } from "@/lib/sms"
import { combineLegacyPhone } from "@/lib/phone"
import { Resend } from "resend"

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
      await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: user.email,
        subject: `How was your Fechi Organics order ${orderRef}?`,
        html: `<p>Hi ${user?.name ?? "there"},</p>
<p>${msg}</p>
<p><a href="${reviewUrl}" style="background:#15803D;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;margin-top:8px">Write a Review</a></p>
<p style="color:#888;font-size:12px;margin-top:16px">Fechi Organics — Fresh &amp; Organic</p>`,
      }).catch((e) => console.error("[review-reminder] email failed:", e))
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[review-reminder] error", e)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
