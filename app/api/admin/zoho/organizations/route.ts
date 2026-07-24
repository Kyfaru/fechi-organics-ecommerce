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

const CreateSchema = z.object({
  name: z.string().min(1),
  zohoOrgId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  refreshToken: z.string().min(1),
}).strict();

/**
 * GET /api/admin/zoho/organizations — list Zoho organizations (no secrets).
 * POST /api/admin/zoho/organizations — create a new organization's credentials.
 *
 * Org credentials are shared infrastructure spanning multiple branches, so
 * beyond the reused branches:update permission, callers must also be
 * global-scope (super_admin or HQ-tier with no branchId) — a branch-scoped
 * manager legitimately has branches:update for their own branch's M-Pesa
 * keys, but must not create or see other organizations' Zoho credentials.
 */
export async function GET(req: NextRequest) {
  await connection();
  const denied = await requirePermission(req, { branches: ["view"] });
  if (denied) return denied;

  try {
    const orgs = await db.zohoOrganization.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, zohoOrgId: true, connectedAt: true,
        branches: { select: { id: true, name: true } },
      },
    });
    return ok({ organizations: orgs });
  } catch (e) {
    console.error("[admin/zoho/organizations] GET error", e);
    return Err.internal(e);
  }
}

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { branches: ["update"] });
  if (denied) return denied;

  const caller = await loadCallerContext();
  if (caller.denied) return caller.denied === "auth" ? Err.authRequired() : Err.forbidden();
  if (!isGlobalScope(caller)) return Err.forbidden();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body.");
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return Err.validation(parsed.error.issues[0].message);
  const { name, zohoOrgId, clientId, clientSecret, refreshToken } = parsed.data;

  try {
    const webhookSecret = randomBytes(32).toString("hex");

    const org = await db.zohoOrganization.create({
      data: {
        name,
        zohoOrgId,
        clientIdEnc: encrypt(clientId),
        clientSecretEnc: encrypt(clientSecret),
        refreshTokenEnc: encrypt(refreshToken),
        webhookSecretEnc: encrypt(webhookSecret),
        connectedAt: new Date(),
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return ok({
      id: org.id,
      name: org.name,
      // Only ever shown once — the one and only time.
      webhookSecret,
      webhookUrl: `${appUrl}/api/zoho/webhook?organizationId=${org.id}`,
    });
  } catch (e) {
    console.error("[admin/zoho/organizations] POST error", e);
    return Err.internal(e);
  }
}
