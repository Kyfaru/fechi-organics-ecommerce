import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { connection, NextRequest } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission } from "@/lib/require-permission";

/** PATCH /api/admin/loyalty/tiers/[id] */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { loyalty: ["update"] });
  if (denied) return denied;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body");
  }

  try {
    const tier = await db.loyaltyTier.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: String(body.name) }),
        ...(body.minSpend !== undefined && { minSpend: Number(body.minSpend) }),
        ...(body.multiplier !== undefined && { multiplier: Number(body.multiplier) }),
        ...(body.benefits !== undefined && { benefits: body.benefits as string[] }),
        ...(body.color !== undefined && { color: String(body.color) }),
      },
    });
    console.info(`[loyalty/tiers/PATCH] Updated tier: ${id}`);
    return ok(tier);
  } catch (e) {
    console.error("[loyalty/tiers/PATCH]", e);
    return Err.internal(e);
  }
}
