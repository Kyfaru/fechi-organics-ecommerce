/**
 * GET /api/admin/notifications/stream?since=<version>
 *
 * Structurally = app/api/tickets/stream/route.ts, but polls the single
 * global "notif:version" Redis key (lib/notification-channel.ts) instead of
 * a per-entity channel. No notification payload is ever pushed over this
 * channel — it only signals "something changed" so the client refetches its
 * own RBAC-scoped queries (unread-count/preview/list). That keeps the push
 * channel itself incapable of leaking data across the RBAC boundary.
 */
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getNotificationVersion } from "@/lib/notification-channel";
import { makeRatelimit } from "@/lib/ratelimit";
import { Ratelimit } from "@upstash/ratelimit";

const ratelimit = makeRatelimit(Ratelimit.slidingWindow(10, "1 m"), "sse_notifications");

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const profile = await db.adminProfile.findUnique({
    where: { userId: session.user.id },
    select: { isActive: true },
  });
  if (!profile?.isActive) return new Response("Forbidden", { status: 403 });

  if (ratelimit) {
    const { success } = await ratelimit.limit(session.user.id);
    if (!success) return new Response("Too Many Requests", { status: 429 });
  }

  const since = Number(req.nextUrl.searchParams.get("since") ?? 0);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      send({ type: "connected", since });

      const poller = setInterval(async () => {
        try {
          const version = await getNotificationVersion();
          if (version > since) {
            send({ type: "update", version });
            cleanup();
            setTimeout(() => { try { controller.close(); } catch {} }, 100);
          }
        } catch {}
      }, 1000);

      const heartbeat = setInterval(() => send({ type: "ping" }), 25_000);

      const maxTimeout = setTimeout(() => {
        send({ type: "timeout" });
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
