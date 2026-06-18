import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";

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
// GET /api/admin/products/categories
// Returns all categories ordered by sortOrder asc, with product count
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  await connection();
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const categories = await db.category.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { products: true } },
      },
    });

    console.info("[admin/products/categories] GET — returned", categories.length);
    return ok({ categories });
  } catch (e) {
    console.error("[admin/products/categories] GET error", e);
    return Err.internal();
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/products/categories
// Creates a new category. The `key` (CategoryKey enum) must be unique.
// ---------------------------------------------------------------------------
const VALID_KEYS = ["FACE_CARE", "BODY_CARE", "HAIR_CARE", "WELLNESS", "BABY_KIDS"] as const;

const CreateSchema = z.object({
  key: z.enum(VALID_KEYS, { error: "key must be one of: " + VALID_KEYS.join(", ") }),
  name: z.string().min(1, "Name is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens"),
  // imageKey is required in the Prisma schema
  imageKey: z.string().default(""),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export async function POST(req: NextRequest) {
  await connection();
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const body = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const category = await db.category.create({
      data: {
        key: parsed.data.key,
        name: parsed.data.name,
        slug: parsed.data.slug,
        imageKey: parsed.data.imageKey,
        isActive: parsed.data.isActive,
        sortOrder: parsed.data.sortOrder,
      },
    });

    console.info("[admin/products/categories] POST — created", category.id, category.slug);
    return created({ category });
  } catch (e: unknown) {
    console.error("[admin/products/categories] POST error", e);
    if ((e as { code?: string }).code === "P2002") {
      return Err.validation("A category with this slug or key already exists");
    }
    return Err.internal();
  }
}
