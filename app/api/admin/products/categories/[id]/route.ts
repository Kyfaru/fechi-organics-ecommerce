import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { invalidateCategoryCache } from "@/lib/cache-tags";
import { assertTrustedOrigin } from "@/lib/origin-check";

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------
async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  return user?.role === "admin" ? user : null;
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/products/categories/[id]
// Update a category's fields
// ---------------------------------------------------------------------------
const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens")
    .optional(),
  imageKey: z.string().optional(),
  isActive: z.boolean().optional(),
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
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const { id } = await params;

    const existing = await db.category.findUnique({ where: { id } });
    if (!existing) return Err.notFound("Category");

    const body = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const category = await db.category.update({
      where: { id },
      data: parsed.data,
    });

    console.info("[admin/products/categories/[id]] PATCH — updated", id);
    invalidateCategoryCache(existing.slug, category.slug);
    return ok({ category });
  } catch (e: unknown) {
    console.error("[admin/products/categories/[id]] PATCH error", e);
    if ((e as { code?: string }).code === "P2002") {
      return Err.validation("A category with this slug already exists");
    }
    return Err.internal();
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/admin/products/categories/[id]
// Hard delete — only allowed if no products are linked
// ---------------------------------------------------------------------------
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const { id } = await params;

    const existing = await db.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!existing) return Err.notFound("Category");

    // Prevent deletion if products are linked
    if (existing._count.products > 0) {
      return Err.validation(
        `Cannot delete category with ${existing._count.products} product${existing._count.products > 1 ? "s" : ""}. Reassign products first.`
      );
    }

    await db.category.delete({ where: { id } });

    console.info("[admin/products/categories/[id]] DELETE —", id);
    invalidateCategoryCache(existing.slug);
    return ok({ id });
  } catch (e) {
    console.error("[admin/products/categories/[id]] DELETE error", e);
    return Err.internal();
  }
}
