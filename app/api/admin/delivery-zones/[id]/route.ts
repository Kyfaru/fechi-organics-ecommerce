import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission } from "@/lib/require-permission";
import { reportError } from "@/lib/observability";

const PatchSchema = z.object({
  county: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  branchId: z.string().optional().nullable(),
  deliveryFeeKes: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
}).strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  const denied = await requirePermission(req, { delivery: ["update"] });
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

  try {
    const zone = await db.deliveryZone.update({ where: { id }, data: parsed.data });
    return ok({ zone });
  } catch (e) {
    reportError(e, { route: "PATCH /api/admin/delivery-zones/[id]", tags: { domain: "delivery-zones" } });
    console.error("[admin/delivery-zones/[id]] PATCH error", e);
    return Err.internal();
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  const denied = await requirePermission(req, { delivery: ["delete"] });
  if (denied) return denied;

  const { id } = await params;
  try {
    await db.deliveryZone.delete({ where: { id } });
    return ok({ id });
  } catch (e) {
    reportError(e, { route: "DELETE /api/admin/delivery-zones/[id]", tags: { domain: "delivery-zones" } });
    console.error("[admin/delivery-zones/[id]] DELETE error", e);
    return Err.internal();
  }
}
