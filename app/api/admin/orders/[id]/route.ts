import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { sendSms, hasSmsConfig } from "@/lib/sms";
import { combineLegacyPhone } from "@/lib/phone";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission } from "@/lib/require-permission";

const STATUS_MESSAGES: Record<string, string> = {
  CONFIRMED:  "has been confirmed",
  PROCESSING: "is being packaged and prepared for shipment",
  SHIPPED:    "has been shipped. Estimated arrival: 1–3 business days",
  CANCELLED:  "has been cancelled. Contact us if you have questions",
  WAITING_TO_PACKAGE: "is being packaged for pickup at our store",
  READY_FOR_PICKUP:   "is ready for pickup — please bring your pickup code",
  PICKED_UP:          "has been picked up. Thank you for your order!",
};

function notifyOrderStatusChange(
  orderId: string,
  userId: string | null,
  orderRef: string,
  status: string,
  phone?: string | null,
  phoneCode?: string | null,
) {
  const msg = STATUS_MESSAGES[status];
  if (!msg || !userId) return;
  const body = `Hi! Your Fechi Organics order ${orderRef} ${msg}.`;
  // fire-and-forget — don't block the admin response
  Promise.resolve().then(async () => {
    try {
      await db.inboxMessage.create({
        data: { userId, type: "SYSTEM", title: `Order ${orderRef} — ${status}`, body, orderId },
      });
    } catch (e) {
      console.error("[notify] inbox failed:", e);
    }
    const smsPhone = phone ? combineLegacyPhone(phone, phoneCode ?? null) : null;
    if (hasSmsConfig() && smsPhone) {
      try { await sendSms(smsPhone, body); } catch (e) { console.error("[notify] SMS failed:", e); }
    }
  });
}

// Shared include for returning the full order after mutations
const ORDER_INCLUDE = {
  user: { select: { name: true, email: true } },
  items: {
    include: {
      product: {
        select: {
          name: true,
          images: { where: { isPrimary: true }, take: 1, select: { objectKey: true } },
        },
      },
    },
  },
  branch: { select: { id: true, name: true, county: true, phone: true } },
  transactions: { orderBy: { createdAt: "desc" }, take: 1, select: { provider: true } },
} as const;

// ---------------------------------------------------------------------------
// GET /api/admin/orders/[id]
// Returns full order detail with user, items (with product thumbnails)
// ---------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();

  const denied = await requirePermission(req, { orders: ["view"] });
  if (denied) return denied;

  try {
    const { id } = await params;

    const order = await db.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        items: {
          include: {
            product: {
              select: {
                name: true,
                images: {
                  where: { isPrimary: true },
                  take: 1,
                  select: { objectKey: true },
                },
              },
            },
          },
        },
        branch: { select: { id: true, name: true, county: true, phone: true } },
        transactions: { orderBy: { createdAt: "desc" }, take: 1, select: { provider: true } },
      },
    });

    if (!order) return Err.notFound("Order");

    console.info("[admin/orders/[id]] GET —", id);
    return ok({ order });
  } catch (e) {
    console.error("[admin/orders/[id]] GET error", e);
    return Err.internal(e);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/orders/[id]
// Supports two modes:
//   1. Fulfillment actions: { action: 'set_processing' | 'unset_processing' | 'ship' | 'cancel' | 'set_packaging' | 'set_ready' | 'set_picked_up', orderNumber?: string }
//   2. Legacy status/paymentStatus update: { status?, paymentStatus? }
// ---------------------------------------------------------------------------
const FulfillmentSchema = z.object({
  action: z.enum(["set_processing", "unset_processing", "ship", "cancel", "set_packaging", "set_ready", "set_picked_up"]),
  orderNumber: z.string().optional(),
}).strict();

const LegacySchema = z.object({
  status: z.enum([
    "PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED",
    "WAITING_TO_PACKAGE", "READY_FOR_PICKUP", "PICKED_UP", "FAILED",
  ]).optional(),
  paymentStatus: z.enum(["PENDING", "PAID", "FAILED"]).optional(),
}).strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { orders: ["update_status"] });
  if (denied) return denied;

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return Err.authRequired();

  try {
    const { id } = await params;

    const body = await req.json().catch(() => ({}));

    // Route to fulfillment handler when "action" key is present
    if ("action" in body) {
      return handleFulfillmentAction(id, body, session.user.id);
    }

    // Legacy path — direct status / paymentStatus update
    const parsed = LegacySchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);
    if (!parsed.data.status && !parsed.data.paymentStatus) {
      return Err.validation("Provide at least one field to update (status or paymentStatus)");
    }

    const order = await db.order.findUnique({ where: { id } });
    if (!order) return Err.notFound("Order");

    const updated = await db.order.update({
      where: { id },
      data: parsed.data,
      include: ORDER_INCLUDE,
    });

    console.info("[admin/orders/[id]] PATCH (legacy) —", id, "→", parsed.data.status);
    return ok({ order: updated });
  } catch (e) {
    console.error("[admin/orders/[id]] PATCH error", e);
    return Err.internal(e);
  }
}

// ---------------------------------------------------------------------------
// Fulfillment action handler
// Each action has explicit pre-condition checks to prevent invalid state transitions.
// ---------------------------------------------------------------------------
async function handleFulfillmentAction(
  orderId: string,
  body: unknown,
  adminUserId: string,
): Promise<Response> {
  const parsed = FulfillmentSchema.safeParse(body);
  if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

  const { action, orderNumber } = parsed.data;

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { phone: true, phoneCode: true } },
      branch: { select: { name: true } }
    },
  });
  if (!order) return Err.notFound("Order");

  switch (action) {
    case "set_processing": {
      // Order-number gate now lives here (was on the old "confirm" action):
      // by the time an order is CONFIRMED, orderNumber is already assigned
      // by the payment-success webhook, so this check is unconditional.
      if (!orderNumber || orderNumber !== order.orderNumber) {
        return Err.validation("Order number does not match — confirmation rejected");
      }
      // New flow: CONFIRMED → PROCESSING (packaging/preparing)
      if (order.deliveryType === "PICKUP") {
        return Err.validation("Use set_packaging for pickup orders — set_processing is for delivery orders only");
      }
      if (order.status !== "CONFIRMED") {
        return Err.validation("Order must be CONFIRMED before it can be processed");
      }
      const updated = await db.order.update({
        where: { id: orderId },
        data: {
          status: "PROCESSING",
          processingBy: adminUserId,
          processedAt: new Date(),
        },
        include: ORDER_INCLUDE,
      });
      await db.orderStatusEvent.create({ data: { orderId, status: "PROCESSING", occurredAt: new Date() } });
      console.info("[admin/orders/[id]] set_processing —", orderId);
      notifyOrderStatusChange(orderId, order.userId, order.orderNumber ?? `#FO-${orderId.slice(0, 8).toUpperCase()}`, "PROCESSING", order.user?.phone, order.user?.phoneCode);
      return ok({ order: updated });
    }

    case "unset_processing": {
      if (order.status !== "PROCESSING") {
        return Err.validation("Order is not in PROCESSING status");
      }
      const updated = await db.order.update({
        where: { id: orderId },
        data: {
          status: "CONFIRMED",
          processingBy: null,
          processedAt: null,
        },
        include: ORDER_INCLUDE,
      });
      console.info("[admin/orders/[id]] unset_processing —", orderId);
      return ok({ order: updated });
    }

    case "ship": {
      // Must be PROCESSING before shipping
      if (order.deliveryType === "PICKUP") {
        return Err.validation("Use set_ready for pickup orders — ship is for delivery orders only");
      }
      if (order.status !== "PROCESSING") {
        return Err.validation("Order must be in PROCESSING status before it can be shipped");
      }
      const updated = await db.order.update({
        where: { id: orderId },
        data: {
          status: "SHIPPED",
          shippedAt: new Date(),
        },
        include: ORDER_INCLUDE,
      });
      await db.orderStatusEvent.create({ data: { orderId, status: "SHIPPED", occurredAt: new Date() } });
      console.info("[admin/orders/[id]] ship —", orderId);
      notifyOrderStatusChange(orderId, order.userId, order.orderNumber ?? `#FO-${orderId.slice(0, 8).toUpperCase()}`, "SHIPPED", order.user?.phone, order.user?.phoneCode);
      return ok({ order: updated });
    }

    case "cancel": {
      // Orders can only be cancelled before they've physically left the building
      // (shipped) or been made available for pickup — after that, cancellation
      // needs a different (refund/return) flow, not a status flip.
      const CANCELLABLE_STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "WAITING_TO_PACKAGE"];
      if (!CANCELLABLE_STATUSES.includes(order.status)) {
        return Err.validation("Order cannot be cancelled once it has shipped or is ready for pickup");
      }
      const updated = await db.order.update({
        where: { id: orderId },
        data: { status: "CANCELLED" },
        include: ORDER_INCLUDE,
      });
      await db.orderStatusEvent.create({ data: { orderId, status: "CANCELLED", occurredAt: new Date() } });
      console.info("[admin/orders/[id]] cancel —", orderId);
      notifyOrderStatusChange(orderId, order.userId, order.orderNumber ?? `#FO-${orderId.slice(0, 8).toUpperCase()}`, "CANCELLED", order.user?.phone, order.user?.phoneCode);
      return ok({ order: updated });
    }

    case "set_packaging": {
      // Order-number gate now lives here (was on the old "confirm" action):
      // by the time an order is CONFIRMED, orderNumber is already assigned
      // by the payment-success webhook, so this check is unconditional.
      if (!orderNumber || orderNumber !== order.orderNumber) {
        return Err.validation("Order number does not match — confirmation rejected");
      }
      if (order.deliveryType !== "PICKUP") {
        return Err.validation("set_packaging is only for PICKUP orders");
      }
      if (order.status !== "CONFIRMED") {
        return Err.validation("Order must be CONFIRMED before packaging can begin");
      }
      const updated = await db.order.update({
        where: { id: orderId },
        data: {
          status: "WAITING_TO_PACKAGE",
          processingBy: adminUserId,
          processedAt: new Date(),
        },
        include: ORDER_INCLUDE,
      });
      await db.orderStatusEvent.create({ data: { orderId, status: "WAITING_TO_PACKAGE", occurredAt: new Date() } });
      console.info("[admin/orders/[id]] set_packaging —", orderId);
      notifyOrderStatusChange(orderId, order.userId, order.orderNumber ?? `#FO-${orderId.slice(0, 8).toUpperCase()}`, "WAITING_TO_PACKAGE", order.user?.phone, order.user?.phoneCode);
      return ok({ order: updated });
    }

    case "set_ready": {
      if (order.status !== "WAITING_TO_PACKAGE") {
        return Err.validation("Order must be in WAITING_TO_PACKAGE status before it can be marked ready");
      }
      const branchName = (order as any).branch?.name;
      const readyMsg = branchName
        ? `Your order is ready for pickup at ${branchName}. Bring your pickup code!`
        : "Your order is ready for pickup. Please bring your pickup code!";
      const updated = await db.order.update({
        where: { id: orderId },
        data: { status: "READY_FOR_PICKUP" },
        include: ORDER_INCLUDE,
      });
      await db.orderStatusEvent.create({ data: { orderId, status: "READY_FOR_PICKUP", occurredAt: new Date() } });
      console.info("[admin/orders/[id]] set_ready —", orderId);
      // Custom message for ready — override STATUS_MESSAGES
      if (order.userId) {
        const orderRef = order.orderNumber ?? `#FO-${orderId.slice(0, 8).toUpperCase()}`;
        Promise.resolve().then(async () => {
          try {
            await db.inboxMessage.create({
              data: { userId: order.userId!, type: "SYSTEM", title: `Order ${orderRef} — Ready for Pickup`, body: readyMsg, orderId },
            });
          } catch (e) { console.error("[notify] inbox failed:", e); }
        });
      }
      return ok({ order: updated });
    }

    case "set_picked_up": {
      // Dual confirmation: pickup only completes once both the staff member
      // handing over the order AND the customer receiving it have confirmed.
      // Mirrors the customer-side confirmation in app/api/orders/[id]/picked-up/route.ts.
      if (order.status !== "READY_FOR_PICKUP") {
        return Err.validation("Order must be in READY_FOR_PICKUP status before it can be marked as picked up");
      }
      const customerAlreadyConfirmed = order.customerPickupConfirmedAt !== null;
      const updated = await db.order.update({
        where: { id: orderId },
        data: customerAlreadyConfirmed
          ? {
              staffPickupConfirmedAt: new Date(),
              status: "PICKED_UP",
              pickedUpAt: new Date(),
            }
          : {
              staffPickupConfirmedAt: new Date(),
            },
        include: ORDER_INCLUDE,
      });
      if (customerAlreadyConfirmed) {
        await db.orderStatusEvent.create({ data: { orderId, status: "PICKED_UP", occurredAt: new Date() } });
        console.info("[admin/orders/[id]] set_picked_up — completed —", orderId);
        notifyOrderStatusChange(orderId, order.userId, order.orderNumber ?? `#FO-${orderId.slice(0, 8).toUpperCase()}`, "PICKED_UP", order.user?.phone, order.user?.phoneCode);
      } else {
        console.info("[admin/orders/[id]] set_picked_up — staff confirmed, waiting on customer —", orderId);
      }
      return ok({ order: updated });
    }

    default:
      return Err.validation("Unknown action");
  }
}
