import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";

/** PATCH /api/admin/banners/[id] */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const banner = await db.banner.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: String(body.name) }),
        ...(body.location !== undefined && { location: String(body.location) }),
        ...(body.imageKey !== undefined && { imageKey: String(body.imageKey) }),
        ...(body.ctaText !== undefined && { ctaText: body.ctaText ? String(body.ctaText) : null }),
        ...(body.ctaLink !== undefined && { ctaLink: body.ctaLink ? String(body.ctaLink) : null }),
        ...(body.startDate !== undefined && { startDate: body.startDate ? new Date(body.startDate as string) : null }),
        ...(body.endDate !== undefined && { endDate: body.endDate ? new Date(body.endDate as string) : null }),
        ...(body.status !== undefined && { status: String(body.status) }),
      },
    });
    console.info(`[banners/PATCH] Updated banner: ${id}`);
    return ok(banner);
  } catch (e) {
    console.error("[banners/PATCH]", e);
    return Err.internal();
  }
}

/** DELETE /api/admin/banners/[id] */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  const { id } = await params;

  try {
    await db.banner.delete({ where: { id } });
    console.info(`[banners/DELETE] Deleted banner: ${id}`);
    return ok({ deleted: true });
  } catch (e) {
    console.error("[banners/DELETE]", e);
    return Err.internal();
  }
}
