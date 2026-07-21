import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { connection, NextRequest } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission } from "@/lib/require-permission";

/** PATCH /api/admin/faqs/[id] */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { content: ["update"] });
  if (denied) return denied;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body");
  }

  try {
    const faq = await db.faq.update({
      where: { id },
      data: {
        ...(body.question !== undefined && { question: String(body.question) }),
        ...(body.answer !== undefined && { answer: String(body.answer) }),
        ...(body.group !== undefined && { group: String(body.group) }),
        ...(body.order !== undefined && { order: Number(body.order) }),
        ...(body.status !== undefined && { status: String(body.status) }),
      },
    });
    console.info(`[faqs/PATCH] Updated FAQ: ${id}`);
    return ok(faq);
  } catch (e) {
    console.error("[faqs/PATCH]", e);
    return Err.internal(e);
  }
}

/** DELETE /api/admin/faqs/[id] */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { content: ["delete"] });
  if (denied) return denied;

  const { id } = await params;

  try {
    await db.faq.delete({ where: { id } });
    console.info(`[faqs/DELETE] Deleted FAQ: ${id}`);
    return ok({ deleted: true });
  } catch (e) {
    console.error("[faqs/DELETE]", e);
    return Err.internal(e);
  }
}
