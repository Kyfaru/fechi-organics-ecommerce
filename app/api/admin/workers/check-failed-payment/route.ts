// Runs 5 minutes after an M-Pesa STK push / Paystack checkout is initiated
// (scheduled via Qstash delay from mpesa/initiate and paystack/initialize).
// If the transaction is still PENDING at that point, the customer abandoned
// the payment flow with no callback — flip the order to FAILED so it doesn't
// linger forever, then notify admins.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyQstashRequest } from "@/lib/qstash";
import { sendAdminNotificationEmail } from "@/lib/email";
import { emailShell, emailSection, emailInfoBox, emailIconCircle, emailLineItem, emailTotalRow, EMAIL_BRAND, FONT_HEADING } from "@/lib/email-template";
import { markPaymentFailed } from "@/lib/payments/post-payment";
import { createNotification } from "@/lib/notify";

function kes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const isValid = await verifyQstashRequest(req.headers.get("upstash-signature"), rawBody);
  if (!isValid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const { orderId, transactionId } = JSON.parse(rawBody) as { orderId: string; transactionId: string };

  const transaction = await db.transaction.findUnique({
    where: { id: transactionId },
    select: { status: true, orderId: true },
  });
  // Already resolved (success or otherwise) before the 5-minute window elapsed.
  if (!transaction || transaction.status !== "PENDING") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  await markPaymentFailed({
    transactionId,
    orderId,
    reason: "Payment timed out after 5 minutes with no callback",
  });

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, user: true, branch: { include: { adminProfiles: { include: { user: true } } } } },
  });
  if (!order) return NextResponse.json({ ok: true });

  const superAdmins = await db.adminProfile.findMany({
    where: { isSuperAdmin: true, isActive: true },
    include: { user: true },
  });
  const recipients = [
    ...(order.branch?.adminProfiles ?? []).map((p) => p.user.email),
    ...superAdmins.map((p) => p.user.email),
  ].filter(Boolean);

  if (recipients.length) {
    const sections = [
      emailSection(`
        ${emailIconCircle("alert", { bg: EMAIL_BRAND.dangerBg, fg: EMAIL_BRAND.danger })}
        <h1 style="margin:0 0 20px;text-align:center;font-family:${FONT_HEADING};font-size:24px;font-weight:700;color:${EMAIL_BRAND.textDark};">Payment Failed</h1>
        ${emailInfoBox("A customer payment failed and has not been retried successfully.", "danger")}
        <p style="margin:20px 0 8px;font-size:14px;color:${EMAIL_BRAND.textBody};">
          <strong>${order.user?.name ?? "Customer"}</strong> — ${order.user?.email ?? order.guestEmail ?? ""} — ${order.deliveryPhone ?? order.user?.phone ?? ""}
        </p>
        <div style="margin:20px 0;">
          ${order.items.map((i) => emailLineItem(i.name, undefined, `Qty: ${i.quantity}`)).join("")}
        </div>
        ${emailTotalRow("Total", kes(order.totalKes), true)}
      `),
    ].join("");

    await sendAdminNotificationEmail({
      to: [...new Set(recipients)],
      subject: `Failed payment #${order.id.slice(0, 8).toUpperCase()}`,
      html: emailShell({ title: "Payment Failed", sectionsHtml: sections }),
    });
  }

  await createNotification({
    type: "PAYMENT_ERROR",
    title: `Payment failed — order #${order.id.slice(0, 8).toUpperCase()}`,
    body: `${order.user?.name ?? order.guestEmail ?? "A customer"}'s payment of ${kes(order.totalKes)} timed out with no callback.`,
    link: `/admin/orders/${order.id}`,
    branchId: order.branchId,
  });

  return NextResponse.json({ ok: true });
}
