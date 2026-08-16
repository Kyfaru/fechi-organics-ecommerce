import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { sendSms, hasSmsConfig } from "@/lib/sms";
import { combineLegacyPhone, normalizePhoneE164 } from "@/lib/phone";
import { sendOrderContactEmail } from "@/lib/email";
import { buildContactMessage, buildContactEmailHtml } from "@/lib/orders/build-contact-message";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { logActivity } from "@/lib/admin-activity";
import { reportError } from "@/lib/observability";

const ContactSchema = z.object({
  channels: z.array(z.enum(["SMS", "INBOX", "EMAIL"])).min(1),
  greeting: z.string().trim().min(1).max(40),
  body: z.string().trim().min(1).max(2000),
}).strict();

type ChannelResult = { channel: "SMS" | "INBOX" | "EMAIL"; ok: boolean; error?: string };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  const denied = await requirePermission(req, { orders: ["update_status"] });
  if (denied) return denied;

  const ctx = await loadCallerContext();
  if (ctx.denied) return Err.authRequired();

  const { id: orderId } = await params;

  const parsed = ContactSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Err.validation(parsed.error.issues[0].message);
  const { channels, greeting, body } = parsed.data;

  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, phoneCode: true } },
        branch: { select: { id: true, phone: true } },
      },
    });
    if (!order) return Err.notFound("Order");

    if (!ctx.isSuperAdmin && ctx.branchId && ctx.branchId !== order.branchId) {
      return Err.forbidden();
    }

    const customerName = order.user?.name ?? null;
    const orderRef = order.orderNumber ?? `#FO-${order.id.slice(0, 8).toUpperCase()}`;
    const messageBody = buildContactMessage({ greeting, customerName, body, branchPhone: order.branch?.phone ?? null });

    const results: ChannelResult[] = [];

    for (const channel of channels) {
      try {
        if (channel === "SMS") {
          const phone = order.user?.phone
            ? combineLegacyPhone(order.user.phone, order.user.phoneCode ?? null)
            : order.deliveryPhone
            ? normalizePhoneE164(order.deliveryPhone)
            : null;
          if (!hasSmsConfig() || !phone) throw new Error("SMS not available for this order");
          await sendSms(phone, messageBody);
          results.push({ channel, ok: true });
        } else if (channel === "INBOX") {
          if (!order.userId) throw new Error("Guest order has no inbox");
          await db.inboxMessage.create({
            data: { userId: order.userId, type: "ORDER_UPDATE", title: `Message about order ${orderRef}`, body: messageBody, orderId: order.id },
          });
          results.push({ channel, ok: true });
        } else {
          const email = order.user?.email ?? order.guestEmail;
          if (!email) throw new Error("No email on file");
          const html = buildContactEmailHtml({ greeting, customerName, body, branchPhone: order.branch?.phone ?? null, orderRef });
          await sendOrderContactEmail(email, `Order ${orderRef} — Fechi Organics`, html);
          results.push({ channel, ok: true });
        }
      } catch (e) {
        reportError(e, { route: "POST /api/admin/orders/[id]/contact", tags: { domain: "orders", channel } });
        results.push({ channel, ok: false, error: e instanceof Error ? e.message : "Failed" });
      }
    }

    await logActivity(
      ctx.id,
      `Contacted customer about order ${orderRef} via ${channels.join("+")}`,
      "order",
      order.id,
      req,
      { channels, bodyPreview: body.slice(0, 200) },
    );

    console.info("[admin/orders/[id]/contact] POST —", orderId, results);
    return ok({ results });
  } catch (e) {
    reportError(e, { route: "POST /api/admin/orders/[id]/contact", tags: { domain: "orders" } });
    console.error("[admin/orders/[id]/contact] POST error", e);
    return Err.internal();
  }
}
