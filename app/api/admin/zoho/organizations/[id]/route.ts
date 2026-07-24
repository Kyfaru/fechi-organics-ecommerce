import { randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { encrypt } from "@/lib/crypto";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { isGlobalScope } from "@/lib/branch-access";
import { assertTrustedOrigin } from "@/lib/origin-check";

// All fields optional — blank/omitted means "leave existing value", same
// convention as the branch-level Zoho PATCH this replaced. Real secrets are
// never round-tripped back to the client to resend unchanged.
const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  zohoOrgId: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().min(1).optional(),
  refreshToken: z.string().min(1).optional(),
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
  const { name, zohoOrgId, clientId, clientSecret, refreshToken } = parsed.data;

  try {
    const org = await db.zohoOrganization.findUnique({ where: { id }, select: { webhookSecretEnc: true } });
    if (!org) return Err.notFound("Zoho organization");

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (zohoOrgId !== undefined) data.zohoOrgId = zohoOrgId;
    if (clientId !== undefined) data.clientIdEnc = encrypt(clientId);
    if (clientSecret !== undefined) data.clientSecretEnc = encrypt(clientSecret);
    if (refreshToken !== undefined) data.refreshTokenEnc = encrypt(refreshToken);

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
      webhookUrl: webhookSecretPlaintext ? `${appUrl}/api/zoho/webhook?organizationId=${id}` : null,
    });
  } catch (e) {
    console.error("[admin/zoho/organizations/[id]] PATCH error", e);
    return Err.internal(e);
  }
}
