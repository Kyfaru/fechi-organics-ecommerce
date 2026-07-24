import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { invalidateProductCache } from "@/lib/cache-tags";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { createNotification } from "@/lib/notify";
import { requirePermission } from "@/lib/require-permission";

// ---------------------------------------------------------------------------
// GET /api/admin/products/[id]
// Returns single product with all images + category
// ---------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();

  const denied = await requirePermission(req, { products: ["view"] });
  if (denied) return denied;

  try {
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
    return Err.internal(e);
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
  outOfStock: z.boolean().optional(),
  sizes: z.array(z.string()).optional(),
  howToUse: z.string().nullable().optional(),
  ingredients: z.string().nullable().optional(),
  // imageObjectKeys: ordered array; index 0 = primary.
  // Passing this replaces all existing images with the new set.
  imageObjectKeys: z.array(z.string()).optional(),
}).strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { products: ["update"] });
  if (denied) return denied;

  try {
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
    invalidateProductCache(existing.slug, updated?.slug);
    return ok({ product: updated });
  } catch (e: unknown) {
    console.error("[admin/products/[id]] PATCH error", e);
    if ((e as { code?: string }).code === "P2002") {
      return Err.validation("A product with this slug already exists");
    }
    return Err.internal(e);
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
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { products: ["delete"] });
  if (denied) return denied;

  try {
    const { id } = await params;

    const existing = await db.product.findUnique({ where: { id } });
    if (!existing) return Err.notFound("Product");

    await db.product.update({ where: { id }, data: { isActive: false } });

    console.info("[admin/products/[id]] DELETE (soft) —", id);
    invalidateProductCache(existing.slug);
    createNotification({
      type: "PRODUCT_DELETED",
      title: `Product removed: ${existing.name}`,
      body: `"${existing.name}" has been unpublished from the store.`,
      link: "/admin/products",
    }).catch(() => {});
    return ok({ id });
  } catch (e) {
    console.error("[admin/products/[id]] DELETE error", e);
    return Err.internal(e);
  }
}
