import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { NextRequest } from "next/server";
import { requireAdminPage } from "@/lib/admin-guard";
import { assertTrustedOrigin } from "@/lib/origin-check";

/** PATCH /api/admin/campaigns/[id] */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requireAdminPage(req, 'campaigns');
  if (denied) return denied;

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
    const campaign = await db.campaign.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: String(body.name) }),
        ...(body.type !== undefined && { type: body.type as "EMAIL" | "SMS" | "PUSH" }),
        ...(body.audienceType !== undefined && { audienceType: String(body.audienceType) }),
        ...(body.subject !== undefined && { subject: body.subject ? String(body.subject) : null }),
        ...(body.content !== undefined && { content: body.content ? String(body.content) : null }),
        ...(body.status !== undefined && { status: body.status as "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "FAILED" }),
        ...(body.scheduledAt !== undefined && { scheduledAt: body.scheduledAt ? new Date(body.scheduledAt as string) : null }),
      },
    });
    console.info(`[campaigns/PATCH] Updated campaign: ${id}`);
    return ok(campaign);
  } catch (e) {
    console.error("[campaigns/PATCH]", e);
    return Err.internal();
  }
}

/** DELETE /api/admin/campaigns/[id] */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requireAdminPage(req, 'campaigns');
  if (denied) return denied;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  const { id } = await params;

  try {
    await db.campaign.delete({ where: { id } });
    console.info(`[campaigns/DELETE] Deleted campaign: ${id}`);
    return ok({ deleted: true });
  } catch (e) {
    console.error("[campaigns/DELETE]", e);
    return Err.internal();
  }
}
