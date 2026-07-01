import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";

/** GET /api/admin/loyalty/tiers
 *  Returns all loyalty tiers + top-20 customers by points for leaderboard.
 */
export async function GET() {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

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
    return Err.internal();
  }
}

/** POST /api/admin/loyalty/tiers — create tier */
export async function POST(req: Request) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

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
    return Err.internal();
  }
}
