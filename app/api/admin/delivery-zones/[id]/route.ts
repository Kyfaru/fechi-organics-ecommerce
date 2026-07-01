import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";

async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  return user?.role === "admin" ? user : null;
}

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
  const admin = await requireAdmin(req);
  if (!admin) return Err.forbidden();

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

  const zone = await db.deliveryZone.update({ where: { id }, data: parsed.data });
  return ok({ zone });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  const admin = await requireAdmin(req);
  if (!admin) return Err.forbidden();

  const { id } = await params;
  await db.deliveryZone.delete({ where: { id } });
  return ok({ id });
}
