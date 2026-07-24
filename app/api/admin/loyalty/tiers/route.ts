import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { connection, NextRequest } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission } from "@/lib/require-permission";

/** GET /api/admin/loyalty/tiers
 *  Returns all loyalty tiers + top-20 customers by points for leaderboard.
 */
export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { loyalty: ["view"] });
  if (denied) return denied;

  try {
    const [tiers, leaderboard] = await Promise.all([
      db.loyaltyTier.findMany({ orderBy: { minSpend: "asc" } }),
      db.loyaltyPoints.findMany({
        orderBy: { points: "desc" },
        take: 20,
        include: { user: { select: { name: true, email: true } } },
      }),
    ]);

    return ok({ tiers, leaderboard });
  } catch (e) {
    console.error("[loyalty/tiers/GET]", e);
    return Err.internal(e);
  }
}

/** POST /api/admin/loyalty/tiers — create tier */
export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { loyalty: ["create"] });
  if (denied) return denied;

  let body: { name: string; minSpend: number; multiplier?: number; benefits?: string[]; color?: string };
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body");
  }

  if (!body.name?.trim()) return Err.validation("Tier name is required");
  if (body.minSpend == null) return Err.validation("minSpend is required");

  try {
    const tier = await db.loyaltyTier.create({
      data: {
        name: body.name.trim(),
        minSpend: Number(body.minSpend),
        multiplier: body.multiplier ?? 1.0,
        benefits: body.benefits ?? [],
        color: body.color ?? "#6B7060",
      },
    });
    console.info(`[loyalty/tiers/POST] Created tier: ${tier.id} — ${tier.name}`);
    return created(tier);
  } catch (e) {
    console.error("[loyalty/tiers/POST]", e);
    return Err.internal(e);
  }
}
