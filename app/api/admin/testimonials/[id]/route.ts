import { db } from "@/lib/db";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { z } from "zod";
import { NextRequest } from "next/server";
import { invalidateTestimonialCache } from "@/lib/cache-tags";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission } from "@/lib/require-permission";

// ---------------------------------------------------------------------------
// DELETE /api/admin/testimonials/[id]
// Permanently deletes a testimonial by id.
// Returns 204 No Content on success.
// ---------------------------------------------------------------------------
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const denied = await requirePermission(req, { content: ["delete"] });
    if (denied) return denied;

    const { id } = await params;

    await db.testimonial.delete({ where: { id } });

    console.info("[admin/testimonials] deleted", id);
    invalidateTestimonialCache();
    return new Response(null, { status: 204 });
  } catch (e) {
    // Prisma throws P2025 when the record does not exist
    if ((e as { code?: string }).code === "P2025") return Err.notFound("Testimonial");
    console.error("[admin/testimonials] DELETE error", e);
    return Err.internal(e);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/testimonials/[id]
// Partial update - accepts any combination of { approved, sortOrder }.
// ---------------------------------------------------------------------------
const UpdateSchema = z.object({
  approved: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
}).strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const denied = await requirePermission(req, { content: ["update"] });
    if (denied) return denied;

    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const data = parsed.data;

    if (Object.keys(data).length === 0) {
      return Err.validation("No fields to update");
    }

    const t = await db.testimonial.update({ where: { id }, data });
    invalidateTestimonialCache();
    return ok({ testimonial: t });
  } catch (e) {
    if ((e as { code?: string }).code === "P2025") return Err.notFound("Testimonial");
    console.error("[admin/testimonials] PATCH error", e);
    return Err.internal(e);
  }
}