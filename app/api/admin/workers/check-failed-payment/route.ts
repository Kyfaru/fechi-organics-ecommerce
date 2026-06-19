import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyQstashRequest } from "@/lib/qstash";
import { sendAdminNotificationEmail } from "@/lib/email";

function kes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const isValid = await verifyQstashRequest(req.headers.get("upstash-signature"), rawBody);
  if (!isValid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const { orderId } = JSON.parse(rawBody) as { orderId: string; userId?: string | null };
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, user: true, branch: { include: { adminProfiles: { include: { user: true } } } } },
  });
  if (!order || order.paymentStatus === "PAID") return NextResponse.json({ ok: true, skipped: true });

  const paidSinceFailure = await db.transaction.findFirst({
    where: { orderId, status: "SUCCESS", updatedAt: { gt: new Date(Date.now() - 10 * 60 * 1000) } },
  });
  if (paidSinceFailure) return NextResponse.json({ ok: true, skipped: true });

  const superAdmins = await db.adminProfile.findMany({
    where: { isSuperAdmin: true, isActive: true },
    include: { user: true },
  });
  const recipients = [
    ...(order.branch?.adminProfiles ?? []).map((p) => p.user.email),
    ...superAdmins.map((p) => p.user.email),
  ].filter(Boolean);

  if (recipients.length) {
    await sendAdminNotificationEmail({
      to: [...new Set(recipients)],
      subject: `Failed payment #${order.id.slice(0, 8).toUpperCase()}`,
      html: `<p>A customer payment failed and has not been retried successfully.</p><p>${order.user?.name ?? "Customer"} - ${order.user?.email ?? order.guestEmail ?? ""} - ${order.deliveryPhone ?? order.user?.phone ?? ""}</p><p>${order.items.map((i) => `${i.name} x ${i.quantity}`).join("<br/>")}</p><p><strong>${kes(order.totalKes)}</strong></p>`,
    });
  }

  return NextResponse.json({ ok: true });
}
