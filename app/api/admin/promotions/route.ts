import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { connection, NextRequest } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission } from "@/lib/require-permission";

/** GET /api/admin/promotions */
export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { promotions: ["view"] });
  if (denied) return denied;

  try {
    const promotions = await db.promotion.findMany({
      orderBy: { createdAt: "desc" },
    });
    return ok(promotions);
  } catch (e) {
    console.error("[promotions/GET]", e);
    return Err.internal(e);
  }
}

/** POST /api/admin/promotions — create promotion */
export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { promotions: ["create"] });
  if (denied) return denied;

  let body: {
    name: string;
    type: string;
    value: number;
    code?: string;
    minOrder?: number;
    maxUses?: number;
    maxUsesPerUser?: number;
    startDate?: string;
    endDate?: string;
    status?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body");
  }

  if (!body.name?.trim()) return Err.validation("Promotion name is required");
  if (!body.type) return Err.validation("Type is required");
  if (body.value == null) return Err.validation("Value is required");

  try {
    const promotion = await db.promotion.create({
      data: {
        name: body.name.trim(),
        type: body.type,
        value: body.value,
        code: body.code ?? null,
        minOrder: body.minOrder ?? null,
        maxUses: body.maxUses ?? null,
        maxUsesPerUser: body.maxUsesPerUser ?? 1,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        status: body.status ?? "active",
      },
    });
    console.info(`[promotions/POST] Created promotion: ${promotion.id} — ${promotion.name}`);
    return created(promotion);
  } catch (e) {
    console.error("[promotions/POST]", e);
    return Err.internal(e);
  }
}
