import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { sendSms } from "@/lib/twilio";
import { assertTrustedOrigin } from "@/lib/origin-check";

const STATUS_MESSAGES: Record<string, string> = {
  CONFIRMED:  "has been confirmed",
  PROCESSING: "is being packaged and prepared for shipment",
  SHIPPED:    "has been shipped. Estimated arrival: 1–3 business days",
  CANCELLED:  "has been cancelled. Contact us if you have questions",
  WAITING_TO_PACKAGE: "is being packaged for pickup at our store",
  READY_FOR_PICKUP:   "is ready for pickup — please bring your pickup code",
  PICKED_UP:          "has been picked up. Thank you for your order!",
};

// Generate a unique order number (non-transaction version)
async function generateOrderNumber(): Promise<string> {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < 5; i++) {
    const suffix = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * 36)]).join("");
    const num = `#FO-${suffix}`;
    const exists = await db.order.findUnique({ where: { orderNumber: num } });
    if (!exists) return num;
  }
  throw new Error("Could not generate unique order number after 5 retries");
}

function notifyOrderStatusChange(
  orderId: string,
  userId: string | null,
  orderRef: string,
  status: string,
  phone?: string | null,
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
    const hasTwilio = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
    if (hasTwilio && phone) {
      try { await sendSms(phone, body); } catch (e) { console.error("[notify] SMS failed:", e); }
    }
  });
}

// ---------------------------------------------------------------------------
// Auth helper — matches pattern in /api/admin/orders/route.ts
// ---------------------------------------------------------------------------
async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  return user?.role === "admin" ? user : null;
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
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

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
      },
    });

    if (!order) return Err.notFound("Order");

    console.info("[admin/orders/[id]] GET —", id);
    return ok({ order });
  } catch (e) {
    console.error("[admin/orders/[id]] GET error", e);
    return Err.internal();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/orders/[id]
// Supports two modes:
//   1. Fulfillment actions: { action: 'set_processing' | 'unset_processing' | 'confirm' | 'ship' | 'cancel', orderNumber?: string }
//   2. Legacy status/paymentStatus update: { status?, paymentStatus? }
// ---------------------------------------------------------------------------
const FulfillmentSchema = z.object({
  action: z.enum(["set_processing", "unset_processing", "confirm", "ship", "cancel", "set_packaging", "set_ready", "set_picked_up"]),
  orderNumber: z.string().optional(),
}).strict();

const LegacySchema = z.object({
  status: z.enum([
    "PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED",
    "WAITING_TO_PACKAGE", "READY_FOR_PICKUP", "PICKED_UP",
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
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const { id } = await params;

    const body = await req.json().catch(() => ({}));

    // Route to fulfillment handler when "action" key is present
    if ("action" in body) {
      return handleFulfillmentAction(id, body, admin.id);
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
    return Err.internal();
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
      user: { select: { phone: true } },
      branch: { select: { name: true } }
    },
  });
  if (!order) return Err.notFound("Order");

  const terminalStatuses = ["SHIPPED", "DELIVERED", "CANCELLED"];

  switch (action) {
    case "confirm": {
      // New flow: PENDING → CONFIRMED (first step)
      // Auto-generate order number if not set; otherwise require the admin to type it
      if (order.orderNumber) {
        if (!orderNumber || orderNumber !== order.orderNumber) {
          return Err.validation("Order number does not match — confirmation rejected");
        }
      }
      const resolvedOrderNumber = order.orderNumber ?? (await generateOrderNumber());
      const updated = await db.order.update({
        where: { id: orderId },
        data: {
          status: "CONFIRMED",
          confirmedBy: adminUserId,
          confirmedAt: new Date(),
          orderNumber: resolvedOrderNumber,
        },
        include: ORDER_INCLUDE,
      });
      await db.orderStatusEvent.create({ data: { orderId, status: "CONFIRMED", occurredAt: new Date() } });
      console.info("[admin/orders/[id]] confirm —", orderId, "orderNumber:", resolvedOrderNumber);
      notifyOrderStatusChange(orderId, order.userId, resolvedOrderNumber, "CONFIRMED", order.user?.phone);
      return ok({ order: updated });
    }

    case "set_processing": {
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
      notifyOrderStatusChange(orderId, order.userId, order.orderNumber ?? `#FO-${orderId.slice(0, 8).toUpperCase()}`, "PROCESSING", order.user?.phone);
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
      notifyOrderStatusChange(orderId, order.userId, order.orderNumber ?? `#FO-${orderId.slice(0, 8).toUpperCase()}`, "SHIPPED", order.user?.phone);
      return ok({ order: updated });
    }

    case "cancel": {
      const updated = await db.order.update({
        where: { id: orderId },
        data: { status: "CANCELLED" },
        include: ORDER_INCLUDE,
      });
      await db.orderStatusEvent.create({ data: { orderId, status: "CANCELLED", occurredAt: new Date() } });
      console.info("[admin/orders/[id]] cancel —", orderId);
      notifyOrderStatusChange(orderId, order.userId, order.orderNumber ?? `#FO-${orderId.slice(0, 8).toUpperCase()}`, "CANCELLED", order.user?.phone);
      return ok({ order: updated });
    }

    case "set_packaging": {
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
      notifyOrderStatusChange(orderId, order.userId, order.orderNumber ?? `#FO-${orderId.slice(0, 8).toUpperCase()}`, "WAITING_TO_PACKAGE", order.user?.phone);
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
      if (order.status !== "READY_FOR_PICKUP") {
        return Err.validation("Order must be in READY_FOR_PICKUP status before it can be marked as picked up");
      }
      const updated = await db.order.update({
        where: { id: orderId },
        data: {
          status: "PICKED_UP",
          pickedUpAt: new Date(),
        },
        include: ORDER_INCLUDE,
      });
      await db.orderStatusEvent.create({ data: { orderId, status: "PICKED_UP", occurredAt: new Date() } });
      console.info("[admin/orders/[id]] set_picked_up —", orderId);
      notifyOrderStatusChange(orderId, order.userId, order.orderNumber ?? `#FO-${orderId.slice(0, 8).toUpperCase()}`, "PICKED_UP", order.user?.phone);
      return ok({ order: updated });
    }

    default:
      return Err.validation("Unknown action");
  }
}
