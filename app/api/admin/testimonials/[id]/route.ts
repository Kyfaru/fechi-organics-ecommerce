import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { z } from "zod";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Auth helper - resolves to the user row if they are an admin, else null
// ---------------------------------------------------------------------------
async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = await db.user.findUnique({ where: { id: session.user.id } });
  return u?.role === "admin" ? u : null;
}

// ---------------------------------------------------------------------------
// DELETE /api/admin/testimonials/[id]
// Permanently deletes a testimonial by id.
// Returns 204 No Content on success.
// ---------------------------------------------------------------------------
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const admin = await requireAdmin();
    if (!admin) return Err.forbidden();

    const { id } = await params;

    await db.testimonial.delete({ where: { id } });

    console.info("[admin/testimonials] deleted", id);
    return new Response(null, { status: 204 });
  } catch (e) {
    // Prisma throws P2025 when the record does not exist
    if ((e as { code?: string }).code === "P2025") return Err.notFound("Testimonial");
    console.error("[admin/testimonials] DELETE error", e);
    return Err.internal();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/testimonials/[id]
// Partial update - accepts any combination of { approved, sortOrder }.
// ---------------------------------------------------------------------------
const UpdateSchema = z.object({
  approved: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const admin = await requireAdmin();
    if (!admin) return Err.forbidden();

    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const data = parsed.data;

    if (Object.keys(data).length === 0) {
      return Err.validation("No fields to update");
    }

    const t = await db.testimonial.update({ where: { id }, data });
    return ok({ testimonial: t });
  } catch (e) {
    if ((e as { code?: string }).code === "P2025") return Err.notFound("Testimonial");
    console.error("[admin/testimonials] PATCH error", e);
    return Err.internal();
  }
}