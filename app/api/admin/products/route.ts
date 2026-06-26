import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";

// ---------------------------------------------------------------------------
// Auth helper — reuses the req.headers pattern from other admin routes
// ---------------------------------------------------------------------------
async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  return user?.role === "admin" ? user : null;
}

// ---------------------------------------------------------------------------
// GET /api/admin/products
// Returns all products ordered by createdAt desc, with category + primary image
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  await connection();
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const products = await db.product.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: {
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          select: { id: true, objectKey: true, isPrimary: true, sortOrder: true, alt: true },
        },
      },
    });

    console.info("[admin/products] GET — returned", products.length, "products");
    return ok({ products });
  } catch (e) {
    console.error("[admin/products] GET error", e);
    return Err.internal();
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/products
// Creates a product, optionally with a primary image
// ---------------------------------------------------------------------------
const CreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens"),
  description: z.string().min(1, "Description is required"),
  shortDescription: z.string().optional(),
  categoryId: z.string().uuid("Invalid category"),
  priceKes: z.number().int().positive("Price must be a positive number"),
  compareAtPriceKes: z.number().int().positive().optional(),
  variantLabel: z.string().optional(),
  stock: z.number().int().min(0, "Stock cannot be negative").default(0),
  bestSeller: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sizes: z.array(z.string()).default([]),
  howToUse: z.string().nullable().optional(),
  ingredients: z.string().nullable().optional(),
  // imageObjectKeys: ordered array; index 0 = primary.
  imageObjectKeys: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  await connection();
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const body = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const { imageObjectKeys, ...productData } = parsed.data;

    const product = await db.product.create({
      data: {
        ...productData,
        ...(imageObjectKeys?.length
          ? {
              images: {
                create: imageObjectKeys.map((objectKey, idx) => ({
                  objectKey,
                  isPrimary: idx === 0,
                  sortOrder: idx,
                })),
              },
            }
          : {}),
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: {
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          select: { objectKey: true, isPrimary: true },
        },
      },
    });

    console.info("[admin/products] POST — created product", product.id, product.slug);
    // Notify admin inbox about new product
    db.notification.create({
      data: {
        type: "admin",
        title: `New product added: ${product.name}`,
        body: `"${product.name}" has been published to the store.`,
        link: `/admin/products`,
      },
    }).catch((e) => console.error("[admin/products] notification create failed:", e));
    return ok({ product });
  } catch (e: unknown) {
    console.error("[admin/products] POST error", e);
    if ((e as { code?: string }).code === "P2002") {
      return Err.validation("A product with this slug already exists");
    }
    return Err.internal();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/products
// Partial update — accepts any subset of mutable fields
// ---------------------------------------------------------------------------
const UpdateSchema = z.object({
  id: z.string().uuid("Invalid product ID"),
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

export async function PATCH(req: NextRequest) {
  await connection();
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const body = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const { id, imageObjectKeys, ...data } = parsed.data;

    const product = await db.product.update({
      where: { id },
      data,
    });

    // If imageObjectKeys provided, replace all images for this product
    if (imageObjectKeys !== undefined) {
      await db.productImage.deleteMany({ where: { productId: id } });
      if (imageObjectKeys.length > 0) {
        await db.productImage.createMany({
          data: imageObjectKeys.map((objectKey, idx) => ({
            productId: id,
            objectKey,
            isPrimary: idx === 0,
            sortOrder: idx,
          })),
        });
      }
    }

    console.info("[admin/products] PATCH — updated product", id);
    return ok({ product });
  } catch (e: unknown) {
    console.error("[admin/products] PATCH error", e);
    if ((e as { code?: string }).code === "P2002") {
      return Err.validation("A product with this slug already exists");
    }
    return Err.internal();
  }
}
