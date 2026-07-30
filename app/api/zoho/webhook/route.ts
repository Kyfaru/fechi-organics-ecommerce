import { NextRequest } from "next/server";
import { connection } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { Err } from "@/lib/api";
import { syncItemToProduct } from "@/lib/zoho-sync";

// ---------------------------------------------------------------------------
// POST /api/zoho/webhook?organizationId=<id>&event=<event>  — public, no auth
// (per-org webhook signature verified below). Receives item lifecycle events
// from a Zoho Books organization shared by one or more branches.
//
// Each org's Zoho config POSTs here with its own organizationId in the query
// string, so we know which org's secret to check the incoming signature
// against. organizationId is caller-supplied and unauthenticated on its own,
// but that's fine: it only selects *which* org's secret we compare against —
// a forged organizationId without that org's real webhookSecretEnc still
// fails signature verification below.
//
// Zoho Books doesn't put an event/action name in the payload body — a real
// captured example is just `{ "sales_receipt": { ... } }` (module name as
// the top-level key, no eventType field). So the event type is carried in
// OUR OWN query string instead: configure one webhook entry per event in
// Zoho Books (Settings → Automation → Webhooks), each pointing at this same
// URL but with a different `event` value, e.g.
//   .../api/zoho/webhook?organizationId=<id>&event=item_created
//   .../api/zoho/webhook?organizationId=<id>&event=item_updated
//   .../api/zoho/webhook?organizationId=<id>&event=item_deleted
//
// UNVERIFIED — signature algorithm: Zoho Books sends a
// "X-Zoho-Webhook-Signature" header ("Generated Hash Value" per their docs),
// but the exact algorithm/encoding isn't documented publicly. Guessing
// HMAC-SHA256 of the raw body, hex-encoded, using the webhook secret as the
// key — the common pattern across Stripe/GitHub/Shopify-style webhooks. On a
// mismatch, both the computed and received values are logged (safe — this
// is a derived hash, not the secret itself) so the algorithm/encoding can be
// corrected quickly once a real webhook fires. If Books turns out not to
// sign at all (i.e. never sends this header), tighten this back down once
// confirmed rather than leaving verification silently permissive.
//
// Always returns 200 to prevent Zoho from retrying on our internal errors.
// ---------------------------------------------------------------------------

type WebhookBody = Record<string, unknown>;
type WebhookHandler = (organizationId: string, body: WebhookBody) => Promise<void>;

function verifySignature(rawBody: string, secret: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(computed);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length) {
      console.warn("[zoho/webhook] Signature length mismatch — computed:", computed, "received:", signatureHeader);
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    console.error("[zoho/webhook] Signature comparison failed", e);
    return false;
  }
}

async function handleItemUpsert(organizationId: string, body: WebhookBody): Promise<void> {
  const item = body.item as { item_id?: string; [key: string]: unknown } | undefined;
  if (!item) return;
  const orgBranches = await db.branch.findMany({
    where: { zohoOrganizationId: organizationId },
    select: { id: true },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await syncItemToProduct(organizationId, item as any, orgBranches);
}

async function handleItemDeleted(organizationId: string, body: WebhookBody): Promise<void> {
  const item = body.item as { item_id?: string } | undefined;
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

  // 1. Resolve organization + event from the query string
  const organizationId = req.nextUrl.searchParams.get("organizationId");
  const eventType = req.nextUrl.searchParams.get("event");
  if (!organizationId || !eventType) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "BAD_REQUEST", message: "Missing organizationId or event query param" } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 2. Verify webhook signature against this org's own secret
  const org = await db.zohoOrganization.findUnique({
    where: { id: organizationId },
    select: { webhookSecretEnc: true },
  });
  if (!org?.webhookSecretEnc) return Err.forbidden();

  let secret: string;
  try {
    secret = decrypt(org.webhookSecretEnc);
  } catch (e) {
    console.error("[zoho/webhook] Failed to decrypt webhook secret for org:", organizationId, e);
    return Err.forbidden();
  }

  // Read the raw body once — signature must be computed over the exact bytes
  // Zoho signed, not a re-serialized version of the parsed JSON.
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-zoho-webhook-signature");
  if (!verifySignature(rawBody, secret, signatureHeader)) {
    return Err.forbidden();
  }

  // 3. Parse body
  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "BAD_REQUEST", message: "Invalid JSON body" } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 4. Handle event — catch errors so we always return 200
  try {
    const handler = EVENT_HANDLERS[eventType];
    if (handler) {
      await handler(organizationId, body);
    } else {
      // Unknown event type — log and ignore
      console.info("[zoho/webhook] Unhandled event:", eventType);
    }
  } catch (e) {
    // Log but don't surface — Zoho expects 200
    console.error("[zoho/webhook] Handler error for event:", eventType, e);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
