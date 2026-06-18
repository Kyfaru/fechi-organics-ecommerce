import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";

/** GET /api/admin/promotions */
export async function GET() {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  try {
    const promotions = await db.promotion.findMany({
      orderBy: { createdAt: "desc" },
    });
    return ok(promotions);
  } catch (e) {
    console.error("[promotions/GET]", e);
    return Err.internal();
  }
}

/** POST /api/admin/promotions — create promotion */
export async function POST(req: Request) {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  let body: {
    name: string;
    type: string;
    value: number;
    code?: string;
    minOrder?: number;
    maxUses?: number;
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
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        status: body.status ?? "active",
      },
    });
    console.info(`[promotions/POST] Created promotion: ${promotion.id} — ${promotion.name}`);
    return created(promotion);
  } catch (e) {
    console.error("[promotions/POST]", e);
    return Err.internal();
  }
}
