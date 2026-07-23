import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { Err } from "@/lib/api";
import { syncItemToProduct } from "@/lib/zoho-sync";

// ---------------------------------------------------------------------------
// POST /api/zoho/webhook?organizationId=<id>  — public, no auth (per-org
// webhook secret verified below). Receives item lifecycle events from a
// Zoho Inventory organization shared by one or more branches.
//
// Each org's Zoho config POSTs here with its own organizationId in the query
// string, so we know which org's secret to check the incoming token
// against. organizationId is caller-supplied and unauthenticated on its own,
// but that's fine: it only selects *which* org's secret we compare against —
// a forged organizationId without that org's real webhookSecretEnc still
// fails the token comparison below.
//
// Always returns 200 to prevent Zoho from retrying on our internal errors.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  await connection();

  // 1. Resolve organization from the query string
  const organizationId = req.nextUrl.searchParams.get("organizationId");
  if (!organizationId) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "BAD_REQUEST", message: "Missing organizationId query param" } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 2. Verify webhook secret token against this org's own secret
  const org = await db.zohoOrganization.findUnique({
    where: { id: organizationId },
    select: { webhookSecretEnc: true },
  });
  if (!org?.webhookSecretEnc) return Err.forbidden();

  const incomingToken = req.headers.get("x-zoho-webhook-token");
  let expectedToken: string;
  try {
    expectedToken = decrypt(org.webhookSecretEnc);
  } catch (e) {
    console.error("[zoho/webhook] Failed to decrypt webhook secret for org:", organizationId, e);
    return Err.forbidden();
  }
  if (!incomingToken || incomingToken !== expectedToken) {
    return Err.forbidden();
  }

  // 3. Parse body
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

  // 4. Handle event — catch errors so we always return 200
  try {
    const item = data?.item as { item_id?: string; [key: string]: unknown } | undefined;

    if (eventType === "item_created" || eventType === "item_updated") {
      if (item) {
        const orgBranches = await db.branch.findMany({
          where: { zohoOrganizationId: organizationId },
          select: { id: true, zohoWarehouseId: true },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await syncItemToProduct(organizationId, item as any, orgBranches);
      }
    } else if (eventType === "item_deleted") {
      if (item?.item_id) {
        // An item deleted from this org's Zoho catalog means every sibling
        // branch under this org no longer stocks it — zero out every
        // branch's stock row, don't touch the shared product's global
        // isActive.
        const mapping = await db.productZohoMapping.findUnique({
          where: { organizationId_zohoItemId: { organizationId, zohoItemId: item.item_id } },
          select: { productId: true },
        });
        if (mapping) {
          const orgBranches = await db.branch.findMany({
            where: { zohoOrganizationId: organizationId },
            select: { id: true },
          });
          await db.branchProductStock.updateMany({
            where: { branchId: { in: orgBranches.map((b) => b.id) }, productId: mapping.productId },
            data: { stock: 0 },
          });
        }
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
