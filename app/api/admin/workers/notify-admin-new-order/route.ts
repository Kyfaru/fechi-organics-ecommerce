import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyQstashRequest } from "@/lib/qstash";
import { sendAdminNotificationEmail } from "@/lib/email";
import { emailShell, emailSection, emailIconCircle, emailLineItem, emailTotalRow, EMAIL_BRAND, FONT_HEADING } from "@/lib/email-template";

function kes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const isValid = await verifyQstashRequest(req.headers.get("upstash-signature"), rawBody);
  if (!isValid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const { orderId } = JSON.parse(rawBody) as { orderId: string };
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, user: { select: { name: true, email: true, phone: true } }, branch: { include: { adminProfiles: { include: { user: true } } } } },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

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
        ${emailIconCircle("chart")}
        <h1 style="margin:0 0 20px;text-align:center;font-family:${FONT_HEADING};font-size:24px;font-weight:700;color:${EMAIL_BRAND.textDark};">New Paid Order</h1>
        <p style="margin:0 0 8px;font-size:14px;color:${EMAIL_BRAND.textBody};">
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
      subject: `New paid order #${order.id.slice(0, 8).toUpperCase()}`,
      html: emailShell({ title: "New Paid Order", sectionsHtml: sections }),
    });
  }

  return NextResponse.json({ ok: true });
}
