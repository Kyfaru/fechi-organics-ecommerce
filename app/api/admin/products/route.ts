import { NextRequest } from "next/server";
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
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const products = await db.product.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: {
          where: { isPrimary: true },
          take: 1,
          select: { objectKey: true },
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
  imageObjectKey: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const body = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const { imageObjectKey, ...productData } = parsed.data;

    const product = await db.product.create({
      data: {
        ...productData,
        ...(imageObjectKey
          ? {
              images: {
                create: { objectKey: imageObjectKey, isPrimary: true, sortOrder: 0 },
              },
            }
          : {}),
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { where: { isPrimary: true }, take: 1, select: { objectKey: true } },
      },
    });

    console.info("[admin/products] POST — created product", product.id, product.slug);
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
});

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const body = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const { id, ...data } = parsed.data;

    const product = await db.product.update({
      where: { id },
      data,
    });

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
