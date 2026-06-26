import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";

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
// GET /api/admin/products/[id]
// Returns single product with all images + category
// ---------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const { id } = await params;

    const product = await db.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: {
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        },
      },
    });

    if (!product) return Err.notFound("Product");

    console.info("[admin/products/[id]] GET —", id);
    return ok({ product });
  } catch (e) {
    console.error("[admin/products/[id]] GET error", e);
    return Err.internal();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/products/[id]
// Update product fields and manage images (add/remove/reorder)
// ---------------------------------------------------------------------------
const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens")
    .optional(),
  description: z.string().min(1).optional(),
  shortDescription: z.string().nullable().optional(),
  categoryId: z.string().uuid().optional(),
  priceKes: z.number().int().positive().optional(),
  compareAtPriceKes: z.number().int().positive().nullable().optional(),
  variantLabel: z.string().nullable().optional(),
  stock: z.number().int().min(0).optional(),
  bestSeller: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sizes: z.array(z.string()).optional(),
  howToUse: z.string().nullable().optional(),
  ingredients: z.string().nullable().optional(),
  // imageObjectKeys: ordered array; index 0 = primary.
  // Passing this replaces all existing images with the new set.
  imageObjectKeys: z.array(z.string()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const { imageObjectKeys, ...productData } = parsed.data;

    // Verify product exists
    const existing = await db.product.findUnique({ where: { id } });
    if (!existing) return Err.notFound("Product");

    // Update product scalar fields
    const product = await db.product.update({
      where: { id },
      data: productData,
    });

    // If imageObjectKeys provided, replace all images for this product
    if (imageObjectKeys !== undefined) {
      // Delete existing images
      await db.productImage.deleteMany({ where: { productId: id } });

      // Create new image records in provided order
      if (imageObjectKeys.length > 0) {
        await db.productImage.createMany({
          data: imageObjectKeys.map((objectKey, idx) => ({
            productId: id,
            objectKey,
            isPrimary: idx === 0,
            sortOrder: idx,
            alt: undefined,
          })),
        });
      }
    }

    // Re-fetch with images and category for fresh response
    const updated = await db.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: {
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        },
      },
    });

    console.info("[admin/products/[id]] PATCH — updated", id);
    return ok({ product: updated });
  } catch (e: unknown) {
    console.error("[admin/products/[id]] PATCH error", e);
    if ((e as { code?: string }).code === "P2002") {
      return Err.validation("A product with this slug already exists");
    }
    return Err.internal();
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/admin/products/[id]
// Soft-delete: sets isActive = false
// ---------------------------------------------------------------------------
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const { id } = await params;

    const existing = await db.product.findUnique({ where: { id } });
    if (!existing) return Err.notFound("Product");

    await db.product.update({ where: { id }, data: { isActive: false } });

    console.info("[admin/products/[id]] DELETE (soft) —", id);
    return ok({ id });
  } catch (e) {
    console.error("[admin/products/[id]] DELETE error", e);
    return Err.internal();
  }
}
