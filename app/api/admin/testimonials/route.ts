import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { z } from "zod";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Auth helper — resolves to the user row if they are an admin, else null
// ---------------------------------------------------------------------------
async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = await db.user.findUnique({ where: { id: session.user.id } });
  return u?.role === "admin" ? u : null;
}

// ---------------------------------------------------------------------------
// GET /api/admin/testimonials
// Returns all testimonials ordered by sortOrder ascending
// ---------------------------------------------------------------------------
export async function GET() {
  await connection();
  try {
    const admin = await requireAdmin();
    if (!admin) return Err.forbidden();

    const testimonials = await db.testimonial.findMany({
      orderBy: { sortOrder: "asc" },
    });

    return ok({ testimonials });
  } catch (e) {
    console.error("[admin/testimonials] GET error", e);
    return Err.internal();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/testimonials
// Accepts { id, approved? } or { id, sortOrder? } — partial updates
// ---------------------------------------------------------------------------
const UpdateSchema = z.object({
  id: z.string().uuid(),
  approved: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export async function PATCH(req: NextRequest) {
  await connection();
  try {
    const admin = await requireAdmin();
    if (!admin) return Err.forbidden();

    const body = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const { id, ...data } = parsed.data;

    // Ensure there is at least one field to update
    if (Object.keys(data).length === 0) {
      return Err.validation("No fields to update");
    }

    const t = await db.testimonial.update({ where: { id }, data });
    return ok({ testimonial: t });
  } catch (e) {
    console.error("[admin/testimonials] PATCH error", e);
    return Err.internal();
  }
}
