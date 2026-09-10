import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { SITE_URL } from "@/lib/site";
import { sendOrderContactMessage } from "@/lib/approval-executors";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { logActivity } from "@/lib/admin-activity";
import { reportError } from "@/lib/observability";

const ContactSchema = z.object({
  channels: z.array(z.enum(["SMS", "INBOX", "EMAIL"])).min(1),
  greeting: z.string().trim().min(1).max(40),
  body: z.string().trim().min(1).max(2000),
}).strict();

// Roles that can send a customer-contact message immediately. Any other role
// that still passes the orders:update_status permission check below (i.e.
// "manager") gets queued through the existing generic approval system
// (lib/approval-executors.ts's "order:contact" entry) instead of sending.
const DIRECT_SEND_ROLES = new Set(["admin", "customer_care"]);

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
      select: { id: true, orderNumber: true, branchId: true, status: true, paymentStatus: true },
    });
    if (!order) return Err.notFound("Order");

    if (!ctx.isSuperAdmin && ctx.branchId && ctx.branchId !== order.branchId) {
      return Err.forbidden();
    }

    const isSuccess = order.paymentStatus === "PAID" && order.status !== "FAILED" && order.status !== "CANCELLED";
    const isFailed = order.status === "FAILED";
    const ctaLink = isSuccess ? `${SITE_URL}/shop` : isFailed ? `${SITE_URL}/contact` : undefined;
    const orderRef = order.orderNumber ?? `#FO-${order.id.slice(0, 8).toUpperCase()}`;

    const canSendDirectly = ctx.isSuperAdmin || DIRECT_SEND_ROLES.has(ctx.role);

    if (!canSendDirectly) {
      await db.approvalRequest.create({
        data: {
          requestedByAdminProfileId: ctx.id,
          resource: "order",
          action: "contact",
          resourceId: order.id,
          payload: { channels, greeting, body, ctaLink },
        },
      });
      logActivity(
        ctx.id,
        `Requested approval to contact customer about order ${orderRef} via ${channels.join("+")}`,
        "order",
        order.id,
        req,
        { channels, bodyPreview: body.slice(0, 200) },
      );
      console.info("[admin/orders/[id]/contact] POST — queued for approval —", orderId);
      return ok({ submittedForApproval: true });
    }

    const sendResult = await sendOrderContactMessage(order.id, { channels, greeting, body, ctaLink });
    if (!sendResult) return Err.notFound("Order");

    await logActivity(
      ctx.id,
      `Contacted customer about order ${orderRef} via ${channels.join("+")}`,
      "order",
      order.id,
      req,
      { channels, bodyPreview: body.slice(0, 200) },
    );

    console.info("[admin/orders/[id]/contact] POST —", orderId, sendResult.results);
    return ok({ results: sendResult.results });
  } catch (e) {
    reportError(e, { route: "POST /api/admin/orders/[id]/contact", tags: { domain: "orders" } });
    console.error("[admin/orders/[id]/contact] POST error", e);
    return Err.internal();
  }
}
