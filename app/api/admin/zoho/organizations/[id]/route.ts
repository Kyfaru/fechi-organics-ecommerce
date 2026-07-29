import { randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, err, Err } from "@/lib/api";
import { encrypt } from "@/lib/crypto";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { isGlobalScope } from "@/lib/branch-access";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { zohoWebhookUrls } from "@/lib/zoho/webhook-events";

// All fields optional — blank/omitted means "leave existing value", same
// convention as the branch-level Zoho PATCH this replaced. Real secrets are
// never round-tripped back to the client to resend unchanged.
const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  zohoOrgId: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().min(1).optional(),
  refreshToken: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
}).strict();

/**
 * PATCH /api/admin/zoho/organizations/[id] — update a Zoho organization's
 * credentials. HQ-only (global scope), same reasoning as the POST/create
 * route in ../route.ts.
 *
 * On first save with no existing webhookSecretEnc, generates one and returns
 * it once, alongside the webhook URL — never shown again after this response.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { branches: ["update"] });
  if (denied) return denied;

  const caller = await loadCallerContext();
  if (caller.denied) return caller.denied === "auth" ? Err.authRequired() : Err.forbidden();
  if (!isGlobalScope(caller)) return Err.forbidden();

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body.");
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return Err.validation(parsed.error.issues[0].message);
  const { name, zohoOrgId, clientId, clientSecret, refreshToken, isActive } = parsed.data;

  try {
    const org = await db.zohoOrganization.findUnique({ where: { id }, select: { webhookSecretEnc: true } });
    if (!org) return Err.notFound("Zoho organization");

    // Deactivating is blocked while any branch still points at this org —
    // deactivate is meant to precede a permanent delete, and an org a branch
    // is actively relying on for sync/sales-receipt pushes must be unlinked
    // first, not silently cut off.
    if (isActive === false) {
      const linkedBranches = await db.branch.findMany({
        where: { zohoOrganizationId: id },
        select: { name: true },
      });
      if (linkedBranches.length > 0) {
        const names = linkedBranches.map((b) => b.name).join(", ");
        return err(
          "ORG_IN_USE",
          `Cannot deactivate — still linked to ${linkedBranches.length} branch${linkedBranches.length === 1 ? "" : "es"}: ${names}.`,
          409,
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (zohoOrgId !== undefined) data.zohoOrgId = zohoOrgId;
    if (clientId !== undefined) data.clientIdEnc = encrypt(clientId);
    if (clientSecret !== undefined) data.clientSecretEnc = encrypt(clientSecret);
    if (refreshToken !== undefined) data.refreshTokenEnc = encrypt(refreshToken);
    if (isActive !== undefined) data.isActive = isActive;

    let webhookSecretPlaintext: string | null = null;
    if (!org.webhookSecretEnc) {
      webhookSecretPlaintext = randomBytes(32).toString("hex");
      data.webhookSecretEnc = encrypt(webhookSecretPlaintext);
    }

    if (Object.keys(data).length > 0) {
      data.connectedAt = new Date();
      await db.zohoOrganization.update({ where: { id }, data });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return ok({
      saved: true,
      webhookSecret: webhookSecretPlaintext,
      webhookUrls: webhookSecretPlaintext ? zohoWebhookUrls(appUrl, id) : null,
    });
  } catch (e) {
    console.error("[admin/zoho/organizations/[id]] PATCH error", e);
    return Err.internal(e);
  }
}

/**
 * DELETE /api/admin/zoho/organizations/[id] — permanently remove a Zoho
 * organization. Only allowed once it's deactivated (isActive: false) —
 * deactivate first via PATCH, which itself refuses while any branch is
 * still linked, so by the time a delete succeeds no branch/sync/push
 * depends on this org's credentials anymore.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const org = await db.zohoOrganization.findUnique({ where: { id }, select: { isActive: true } });
    if (!org) return Err.notFound("Zoho organization");
    if (org.isActive) {
      return err("ORG_ACTIVE", "Deactivate this organization first, then delete it.", 409);
    }

    // Defense in depth — a branch could theoretically have been re-linked
    // between deactivation and this delete request.
    const linkedBranches = await db.branch.count({ where: { zohoOrganizationId: id } });
    if (linkedBranches > 0) {
      return err("ORG_IN_USE", `Cannot delete — still linked to ${linkedBranches} branch${linkedBranches === 1 ? "" : "es"}.`, 409);
    }

    await db.$transaction([
      // productZohoMapping cascades on delete; zohoPushLog doesn't (it's a
      // durable audit trail) — detach it instead of losing the delete to a
      // foreign-key error.
      db.zohoPushLog.updateMany({ where: { organizationId: id }, data: { organizationId: null } }),
      db.zohoOrganization.delete({ where: { id } }),
    ]);

    return ok({ deleted: id });
  } catch (e) {
    console.error("[admin/zoho/organizations/[id]] DELETE error", e);
    return Err.internal(e);
  }
}
