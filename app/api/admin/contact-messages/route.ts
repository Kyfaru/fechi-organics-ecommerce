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
  return user?.role === "admin" ? session.user : null;
}

export async function GET(req: NextRequest) {
  await connection();
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const sp = req.nextUrl.searchParams;
    const status = sp.get("status") as "new" | "read" | "archived" | null;
    const cursor = sp.get("cursor") ?? undefined;
    const limit = 20;

    const where = status ? { status } : {};
    const messages = await db.contactMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = messages.length > limit;
    const items = messages.slice(0, limit);
    return ok({ items, nextCursor: hasMore ? items[items.length - 1].id : null });
  } catch (e) {
    console.error("[admin/contact-messages] GET error", e);
    return Err.internal();
  }
}

const UpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "read", "archived"]),
}).strict();

export async function PATCH(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const body = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const updated = await db.contactMessage.update({
      where: { id: parsed.data.id },
      data: { status: parsed.data.status },
    });
    return ok(updated);
  } catch (e) {
    console.error("[admin/contact-messages] PATCH error", e);
    return Err.internal();
  }
}
