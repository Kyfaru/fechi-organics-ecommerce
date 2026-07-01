import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";

/** PATCH /api/admin/faqs/[id] */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

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
    return Err.internal();
  }
}

/** DELETE /api/admin/faqs/[id] */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(_req);
  if (originCheck) return originCheck;
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  const { id } = await params;

  try {
    await db.faq.delete({ where: { id } });
    console.info(`[faqs/DELETE] Deleted FAQ: ${id}`);
    return ok({ deleted: true });
  } catch (e) {
    console.error("[faqs/DELETE]", e);
    return Err.internal();
  }
}
