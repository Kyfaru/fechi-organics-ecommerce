import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission } from "@/lib/require-permission";

const ZoneSchema = z.object({
  county: z.string().min(1),
  name: z.string().min(1),
  branchId: z.string().optional().nullable(),
  deliveryFeeKes: z.number().int().min(0),
  isActive: z.boolean().optional(),
}).strict();

export async function GET(req: NextRequest) {
  await connection();
  const denied = await requirePermission(req, { delivery: ["view"] });
  if (denied) return denied;

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
  const denied = await requirePermission(req, { delivery: ["create"] });
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = ZoneSchema.safeParse(body);
  if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

  const zone = await db.deliveryZone.create({ data: parsed.data });
  return created({ zone });
}
