/**
 * GET /api/admin/orders/instore/stream?inStoreOrderId=...
 *
 * Admin-side equivalent of app/api/payments/stream/route.ts's SSE
 * waiting-room — same Redis-polling ReadableStream shape, but reads the
 * in-store payment channel and requires an admin session instead of order
 * ownership.
 *
 * The Redis payload written by lib/payments/instore-post-payment.ts and the
 * C2B claim route uses "instore_payment_success"/"instore_payment_failed" as
 * its `type` (kept distinct so it's obviously in-store-only if inspected
 * directly in Redis). This route translates that back down to
 * "payment_success"/"payment_failed" on the wire so the frontend's
 * use-payment-stream-style hook can share the exact same event vocabulary
 * as the customer flow.
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Err } from "@/lib/api";
import { getRedis } from "@/lib/redis";
import { paymentChannel } from "@/lib/payment-channel";
import { Ratelimit } from "@upstash/ratelimit";
import { makeRatelimit } from "@/lib/ratelimit";

const ratelimit = makeRatelimit(Ratelimit.slidingWindow(5, "1 m"), "sse_instore_payment");

async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { adminProfile: true },
  });
  return user?.role === "admin" ? user : null;
}

// Translates the Redis payload's in-store-specific `type` down to the
// customer flow's wire vocabulary the frontend hook already understands.
function translateType(type: unknown): unknown {
  if (type === "instore_payment_success") return "payment_success";
  if (type === "instore_payment_failed") return "payment_failed";
  return type;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return new Response("Unauthorized", { status: 401 });

  const inStoreOrderId = req.nextUrl.searchParams.get("inStoreOrderId");
  if (!inStoreOrderId) return Err.validation("inStoreOrderId is required");

  if (ratelimit) {
    const { success } = await ratelimit.limit(admin.id);
    if (!success) return new Response("Too Many Requests", { status: 429 });
  }

  const order = await db.inStoreOrder.findUnique({
    where: { id: inStoreOrderId },
    select: { id: true, paymentStatus: true },
  });
  if (!order) return new Response("Not Found", { status: 404 });

  if (order.paymentStatus === "PAID") {
    return Response.json({ type: "payment_success", inStoreOrderId, immediate: true });
  }
  if (order.paymentStatus === "FAILED") {
    return Response.json({ type: "payment_failed", inStoreOrderId, immediate: true });
  }

  const channel = paymentChannel(inStoreOrderId);
  const redis = getRedis();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      send({ type: "connected", inStoreOrderId });

      const poller = setInterval(async () => {
        try {
          const result = await redis.get(channel);
          if (result) {
            const payload = (typeof result === "string" ? JSON.parse(result) : result) as Record<string, unknown>;
            send({ ...payload, type: translateType(payload.type) });
            cleanup();
            setTimeout(() => { try { controller.close(); } catch {} }, 100);
          }
        } catch {}
      }, 1000);

      const heartbeat = setInterval(() => send({ type: "ping" }), 25_000);

      const maxTimeout = setTimeout(() => {
        send({ type: "timeout", message: "Payment confirmation window expired" });
        cleanup();
        try { controller.close(); } catch {}
      }, 10 * 60 * 1000);

      function cleanup() {
        clearInterval(poller);
        clearInterval(heartbeat);
        clearTimeout(maxTimeout);
      }

      req.signal.addEventListener("abort", () => {
        cleanup();
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
