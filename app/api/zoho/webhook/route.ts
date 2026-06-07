import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { Err } from "@/lib/api";
import { syncItemToProduct } from "@/lib/zoho-sync";

// ---------------------------------------------------------------------------
// POST /api/zoho/webhook  — public, no auth (token-verified)
// Receives item lifecycle events from Zoho Inventory webhooks.
// Always returns 200 to prevent Zoho from retrying on our internal errors.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  // 1. Verify webhook secret token
  const incomingToken = req.headers.get("x-zoho-webhook-token");
  const expectedToken = process.env.ZOHO_WEBHOOK_SECRET;

  if (!expectedToken || incomingToken !== expectedToken) {
    return Err.forbidden();
  }

  // 2. Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "BAD_REQUEST", message: "Invalid JSON body" } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const payload = body as { eventType?: string; data?: { item?: unknown } };
  const { eventType, data } = payload;

  if (!eventType) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "BAD_REQUEST", message: "Missing eventType" } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 3. Handle event — catch errors so we always return 200
  try {
    const item = data?.item as { item_id?: string; [key: string]: unknown } | undefined;

    if (eventType === "item_created" || eventType === "item_updated") {
      if (item) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await syncItemToProduct(item as any);
      }
    } else if (eventType === "item_deleted") {
      if (item?.item_id) {
        await db.product.updateMany({
          where: { zohoItemId: item.item_id },
          data: { isActive: false },
        });
      }
    } else {
      // Unknown event type — log and ignore
      console.info("[zoho/webhook] Unhandled eventType:", eventType);
    }
  } catch (e) {
    // Log but don't surface — Zoho expects 200
    console.error("[zoho/webhook] Handler error for eventType:", eventType, e);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
