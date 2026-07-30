import { randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { encrypt } from "@/lib/crypto";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { isGlobalScope } from "@/lib/branch-access";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { zohoWebhookUrls } from "@/lib/zoho/webhook-events";

/**
 * POST /api/admin/zoho/organizations/[id]/rotate-webhook — generate a fresh
 * webhook secret for this org, immediately invalidating the old one (any
 * webhook still signing with it will fail verification in
 * app/api/zoho/webhook/route.ts from this point on). The webhook URLs
 * themselves don't change — only the secret each Zoho Books webhook entry
 * needs to be updated with.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { branches: ["update"] });
  if (denied) return denied;

  const caller = await loadCallerContext();
  if (caller.denied) return caller.denied === "auth" ? Err.authRequired() : Err.forbidden();
  if (!isGlobalScope(caller)) return Err.forbidden();

  const { id } = await params;

  try {
    const org = await db.zohoOrganization.findUnique({ where: { id }, select: { id: true } });
    if (!org) return Err.notFound("Zoho organization");

    // 24 bytes -> 48 hex chars, under Zoho's 50-character webhook secret
    // limit (matches ../route.ts's create/PATCH paths).
    const webhookSecret = randomBytes(24).toString("hex");
    await db.zohoOrganization.update({
      where: { id },
      data: { webhookSecretEnc: encrypt(webhookSecret) },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return ok({
      // Only ever shown once — the one and only time.
      webhookSecret,
      webhookUrls: zohoWebhookUrls(appUrl, id),
    });
  } catch (e) {
    console.error("[admin/zoho/organizations/[id]/rotate-webhook] POST error", e);
    return Err.internal(e);
  }
}
