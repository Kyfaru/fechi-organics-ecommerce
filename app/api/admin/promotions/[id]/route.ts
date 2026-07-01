import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";

/** PATCH /api/admin/promotions/[id] */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

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
        ...(body.startDate !== undefined && { startDate: body.startDate ? new Date(body.startDate as string) : null }),
        ...(body.endDate !== undefined && { endDate: body.endDate ? new Date(body.endDate as string) : null }),
        ...(body.status !== undefined && { status: String(body.status) }),
      },
    });
    console.info(`[promotions/PATCH] Updated promotion: ${id}`);
    return ok(promotion);
  } catch (e) {
    console.error("[promotions/PATCH]", e);
    return Err.internal();
  }
}

/** DELETE /api/admin/promotions/[id] */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(_req);
  if (originCheck) return originCheck;
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  const { id } = await params;

  try {
    await db.promotion.delete({ where: { id } });
    console.info(`[promotions/DELETE] Deleted promotion: ${id}`);
    return ok({ deleted: true });
  } catch (e) {
    console.error("[promotions/DELETE]", e);
    return Err.internal();
  }
}
