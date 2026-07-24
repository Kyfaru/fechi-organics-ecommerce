import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { connection, NextRequest } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission } from "@/lib/require-permission";

/** PATCH /api/admin/promotions/[id] */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { promotions: ["update"] });
  if (denied) return denied;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body");
  }

  try {
    const promotion = await db.promotion.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: String(body.name) }),
        ...(body.type !== undefined && { type: String(body.type) }),
        ...(body.value !== undefined && { value: Number(body.value) }),
        ...(body.code !== undefined && { code: body.code ? String(body.code) : null }),
        ...(body.minOrder !== undefined && { minOrder: body.minOrder ? Number(body.minOrder) : null }),
        ...(body.maxUses !== undefined && { maxUses: body.maxUses ? Number(body.maxUses) : null }),
        ...(body.maxUsesPerUser !== undefined && { maxUsesPerUser: Number(body.maxUsesPerUser) }),
        ...(body.startDate !== undefined && { startDate: body.startDate ? new Date(body.startDate as string) : null }),
        ...(body.endDate !== undefined && { endDate: body.endDate ? new Date(body.endDate as string) : null }),
        ...(body.status !== undefined && { status: String(body.status) }),
      },
    });
    console.info(`[promotions/PATCH] Updated promotion: ${id}`);
    return ok(promotion);
  } catch (e) {
    console.error("[promotions/PATCH]", e);
    return Err.internal(e);
  }
}

/** DELETE /api/admin/promotions/[id] */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { promotions: ["delete"] });
  if (denied) return denied;

  const { id } = await params;

  try {
    await db.promotion.delete({ where: { id } });
    console.info(`[promotions/DELETE] Deleted promotion: ${id}`);
    return ok({ deleted: true });
  } catch (e) {
    console.error("[promotions/DELETE]", e);
    return Err.internal(e);
  }
}
