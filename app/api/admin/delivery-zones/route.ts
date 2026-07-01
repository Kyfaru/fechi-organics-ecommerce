import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";

async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  return user?.role === "admin" ? user : null;
}

const ZoneSchema = z.object({
  county: z.string().min(1),
  name: z.string().min(1),
  branchId: z.string().optional().nullable(),
  deliveryFeeKes: z.number().int().min(0),
  isActive: z.boolean().optional(),
}).strict();

export async function GET(req: NextRequest) {
  await connection();
  const admin = await requireAdmin(req);
  if (!admin) return Err.forbidden();

  const county = req.nextUrl.searchParams.get("county");
  const zones = await db.deliveryZone.findMany({
    where: county ? { county } : {},
    orderBy: [{ county: "asc" }, { name: "asc" }],
    include: { branch: { select: { id: true, name: true, county: true } } },
  });
  return ok({ zones });
}

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  const admin = await requireAdmin(req);
  if (!admin) return Err.forbidden();

  const body = await req.json().catch(() => null);
  const parsed = ZoneSchema.safeParse(body);
  if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

  const zone = await db.deliveryZone.create({ data: parsed.data });
  return created({ zone });
}
