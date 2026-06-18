import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";

/** PATCH /api/admin/loyalty/tiers/[id] */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    return Err.internal();
  }
}
