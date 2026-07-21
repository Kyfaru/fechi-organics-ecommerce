/**
 * POST /api/admin/orders/instore/mpesa/c2b/register
 *
 * One-time, rare infra action: registers this app's Confirmation/Validation
 * URLs with Safaricom's Daraja C2B API for a branch's till/paybill. Requires
 * super-admin — this is a per-branch setup step, not a per-order action, and
 * mis-registering it affects every future till payment for that branch.
 *
 * No DB state is persisted here (the branch model is deliberately not
 * modified) — Safaricom stores the registration on their side.
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { ok, err, Err } from "@/lib/api";
import { getDarajaToken } from "@/lib/payments/mpesa/daraja-client";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission } from "@/lib/require-permission";
import { z } from "zod";

const DARAJA_BASE =
  process.env.DARAJA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

const bodySchema = z.object({ branchId: z.string().uuid() }).strict();

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  const denied = await requirePermission(req, { branches: ["update"] });
  if (denied) return denied;

  // This is a per-branch infra action (registers Daraja C2B URLs, affects
  // every future till payment for the branch) — hard-require super-admin on
  // top of branches:update, not just the ac grant. Matches the same
  // isSuperAdmin hard-rule pattern used for staff role promotion / deletion.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();
  const admin = await db.user.findUnique({
    where: { id: session.user.id },
    include: { adminProfile: true },
  });
  if (!admin?.adminProfile?.isSuperAdmin) return Err.forbidden();

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return Err.validation("Invalid request body");
  }

  try {
    const branch = await db.branch.findUnique({ where: { id: parsed.branchId, isActive: true } });
    if (!branch) return err("NO_BRANCH", "Branch not found or inactive", 400);

    const appUrl = process.env.MPESA_CALLBACK_BASE_URL;
    if (!appUrl) return Err.internal("MPESA_CALLBACK_BASE_URL is not configured");

    const token = await getDarajaToken(branch);
    const res = await fetch(`${DARAJA_BASE}/mpesa/c2b/v1/registerurl`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ShortCode: branch.shortcode,
        ResponseType: "Completed",
        ConfirmationURL: `${appUrl}/api/payments/mpesa/c2b/confirmation`,
        ValidationURL: `${appUrl}/api/payments/mpesa/c2b/validation`,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const safaricom = await res.json();

    if (!res.ok) {
      console.error("[instore/mpesa/c2b/register] Daraja rejected registration", safaricom);
      return err("REGISTER_FAILED", "Safaricom rejected the C2B URL registration", 502);
    }

    console.info(`[instore/mpesa/c2b/register] Registered — branch=${branch.id}`);
    return ok({ safaricom });
  } catch (e) {
    console.error("[instore/mpesa/c2b/register] POST error", e);
    return Err.internal(e);
  }
}
