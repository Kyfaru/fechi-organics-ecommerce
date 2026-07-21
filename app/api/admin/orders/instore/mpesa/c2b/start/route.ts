/**
 * POST /api/admin/orders/instore/mpesa/c2b/start
 *
 * Cheap validation ack for the admin's "waiting for a till payment" UI flow.
 * No DB write — the actual matching state lives entirely in
 * mpesaC2bTransaction rows (populated by the Confirmation webhook) plus the
 * caller's own elapsed-time tracking on the client. This route just confirms
 * the branch + amount are sane before the admin starts watching for a match.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, err, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission } from "@/lib/require-permission";

const bodySchema = z
  .object({
    branchId: z.string().uuid().optional(),
    amountKes: z.number().int().positive(),
  })
  .strict();

async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { adminProfile: true },
  });
  return user?.role === "admin" ? user : null;
}

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  const denied = await requirePermission(req, { orders: ["update_status"] });
  if (denied) return denied;

  const admin = await requireAdmin(req);
  if (!admin) return Err.forbidden();

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return Err.validation("Invalid request body");
  }

  try {
    if (admin.adminProfile?.isSuperAdmin) {
      if (!parsed.branchId) return Err.validation("branchId is required for super admins");
      const branch = await db.branch.findUnique({ where: { id: parsed.branchId, isActive: true } });
      if (!branch) return err("NO_BRANCH", "Branch not found or inactive", 400);
    } else {
      if (!admin.adminProfile?.branchId) {
        return err("NO_BRANCH", "Admin has no assigned branch", 400);
      }
      const branch = await db.branch.findUnique({
        where: { id: admin.adminProfile.branchId, isActive: true },
      });
      if (!branch) return err("NO_BRANCH", "Assigned branch not found or inactive", 400);
    }

    return ok({ windowSeconds: 600 });
  } catch (e) {
    console.error("[instore/mpesa/c2b/start] POST error", e);
    return Err.internal(e);
  }
}
