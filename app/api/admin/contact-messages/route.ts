import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission } from "@/lib/require-permission";

export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { contact_messages: ["view"] });
  if (denied) return denied;

  try {
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
    return Err.internal(e);
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

  const denied = await requirePermission(req, { contact_messages: ["update"] });
  if (denied) return denied;

  try {
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
    return Err.internal(e);
  }
}
