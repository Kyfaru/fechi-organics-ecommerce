import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { invalidateCategoryCache } from "@/lib/cache-tags";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission } from "@/lib/require-permission";

// ---------------------------------------------------------------------------
// Derive a URL-safe slug/key from a human-readable category name.
// "Face Care" → "face_care"  |  "Baby & Kids" → "baby_kids"
// ---------------------------------------------------------------------------
function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_") // replace any non-alphanumeric run with _
    .replace(/^_+|_+$/g, "");    // trim leading/trailing underscores
}

// ---------------------------------------------------------------------------
// GET /api/admin/products/categories
// Returns all categories ordered by sortOrder asc, with product count.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { products: ["view"] });
  if (denied) return denied;

  try {
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
    return Err.internal(e);
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/products/categories
// Accepts { name, isActive?, sortOrder?, imageKey? }.
// key and slug are auto-derived from name and must be unique.
// ---------------------------------------------------------------------------
const CreateSchema = z.object({
  name:      z.string().min(1, "Name is required").max(100, "Name too long"),
  imageKey:  z.string().default(""),
  isActive:  z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
}).strict();

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { products: ["create"] });
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const slug = slugifyName(parsed.data.name);
    if (!slug) return Err.validation("Name produces an empty slug — please use a valid category name");

    const category = await db.category.create({
      data: {
        key:       slug,
        slug,
        name:      parsed.data.name,
        imageKey:  parsed.data.imageKey,
        isActive:  parsed.data.isActive,
        sortOrder: parsed.data.sortOrder,
      },
    });

    console.info("[admin/products/categories] POST — created", category.id, category.slug);
    invalidateCategoryCache(category.slug);
    return created({ category });
  } catch (e: unknown) {
    console.error("[admin/products/categories] POST error", e);
    if ((e as { code?: string }).code === "P2002") {
      return Err.validation("A category with this name already exists");
    }
    return Err.internal(e);
  }
}
