import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { Err } from "@/lib/api";
import { syncItemToProduct } from "@/lib/zoho-sync";

// ---------------------------------------------------------------------------
// POST /api/zoho/webhook?organizationId=<id>  — public, no auth (per-org
// webhook secret verified below). Receives item lifecycle events from a
// Zoho Books organization shared by one or more branches.
//
// Each org's Zoho config POSTs here with its own organizationId in the query
// string, so we know which org's secret to check the incoming token
// against. organizationId is caller-supplied and unauthenticated on its own,
// but that's fine: it only selects *which* org's secret we compare against —
// a forged organizationId without that org's real webhookSecretEnc still
// fails the token comparison below.
//
// UNVERIFIED — the event name strings and the { eventType, data: { item } }
// envelope below are Zoho Inventory's specific webhook shape, carried over
// as a starting point. Zoho Books' exact event names/envelope aren't
// enumerated in public docs — capture one real test payload from Zoho
// Books' webhook settings page (Settings → Automation → Webhooks → send
// test event) and correct EVENT_HANDLERS' keys/parsing below before
// removing this flag. The secret-verification skeleton above is
// provider-agnostic and doesn't need changing.
//
// Always returns 200 to prevent Zoho from retrying on our internal errors.
// ---------------------------------------------------------------------------

type WebhookEventData = { item?: unknown };
type WebhookHandler = (organizationId: string, data: WebhookEventData) => Promise<void>;

async function handleItemUpsert(organizationId: string, data: WebhookEventData): Promise<void> {
  const item = data.item as { item_id?: string; [key: string]: unknown } | undefined;
  if (!item) return;
  const orgBranches = await db.branch.findMany({
    where: { zohoOrganizationId: organizationId },
    select: { id: true },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await syncItemToProduct(organizationId, item as any, orgBranches);
}

async function handleItemDeleted(organizationId: string, data: WebhookEventData): Promise<void> {
  const item = data.item as { item_id?: string } | undefined;
  if (!item?.item_id) return;
  // An item deleted from this org's Zoho catalog means every sibling branch
  // under this org no longer stocks it — zero out every branch's stock row,
  // don't touch the shared product's global isActive.
  const mapping = await db.productZohoMapping.findUnique({
    where: { organizationId_zohoItemId: { organizationId, zohoItemId: item.item_id } },
    select: { productId: true },
  });
  if (!mapping) return;
  const orgBranches = await db.branch.findMany({
    where: { zohoOrganizationId: organizationId },
    select: { id: true },
  });
  await db.branchProductStock.updateMany({
    where: { branchId: { in: orgBranches.map((b) => b.id) }, productId: mapping.productId },
    data: { stock: 0 },
  });
}

const EVENT_HANDLERS: Record<string, WebhookHandler> = {
  item_created: handleItemUpsert,
  item_updated: handleItemUpsert,
  item_deleted: handleItemDeleted,
};

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
    const handler = EVENT_HANDLERS[eventType];
    if (handler) {
      await handler(organizationId, data ?? {});
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
