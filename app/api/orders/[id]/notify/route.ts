import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { sendSms } from "@/lib/twilio";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return Err.authRequired();

  const { id: orderId } = await params;

  const order = await db.order.findFirst({
    where: { id: orderId, userId: session.user.id },
    select: {
      id: true,
      orderNumber: true,
      totalKes: true,
      userId: true,
      user: { select: { name: true, phone: true } },
    },
  });
  if (!order?.userId) return Err.notFound("Order");

  const shortRef = order.orderNumber ?? `#FO-${orderId.slice(0, 8).toUpperCase()}`;
  const totalStr = `KES ${(order.totalKes / 100).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
  const firstName = order.user?.name?.split(" ")[0] ?? "there";

  const messageBody =
    `Hi ${firstName}! Order ${shortRef} confirmed ✓\n` +
    `Total: ${totalStr}\n` +
    `Estimated delivery: 1-3 business days\n` +
    `Thank you for shopping with Fechi Organics!`;

  // 1. In-app inbox (idempotent — skip if message already exists for this order)
  let inboxOk = false;
  try {
    const existing = await db.inboxMessage.findFirst({
      where: { orderId, userId: order.userId },
    });
    if (!existing) {
      await db.inboxMessage.create({
        data: {
          userId: order.userId,
          type: "SYSTEM",
          title: `Order ${shortRef} Confirmed`,
          body: messageBody,
          orderId,
        },
      });
    }
    inboxOk = true;
  } catch (e) {
    console.error("[notify] inbox create failed:", e);
  }

  // 2. SMS — graceful no-op if Twilio not configured or user has no phone
  let smsOk = true; // default true — missing config is not a user-visible error
  const phone = (order.user as { phone?: string | null } | null)?.phone;
  const hasTwilio = !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );

  if (hasTwilio && phone) {
    try {
      await sendSms(phone, messageBody);
    } catch (e) {
      console.error("[notify] SMS failed:", e);
      smsOk = false;
    }
  }

  return ok({ inboxOk, smsOk });
}
