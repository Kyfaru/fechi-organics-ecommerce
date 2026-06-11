import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { r2PublicUrl } from "@/lib/r2";

export async function GET(req: NextRequest) {
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) return ok({ productIds: [] });

    const full = req.nextUrl.searchParams.get("full") === "1";

    // Default: return product IDs only (used by ProductCard heart button)
    if (!full) {
      const favs = await db.favorite.findMany({
        where: { userId: session.user.id },
        select: { productId: true },
      });
      return ok({ productIds: favs.map((f) => f.productId) });
    }

    // full=1: return complete ProductCard shapes (used by wishlist page)
    const favs = await db.favorite.findMany({
      where: { userId: session.user.id },
      include: {
        product: {
          include: {
            images: { orderBy: { sortOrder: "asc" as const } },
            category: { select: { name: true, slug: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" as const },
    });

    const products = favs.map(({ product: p }) => {
      const primary = p.images.find((i) => i.isPrimary) ?? p.images[0];
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        shortDescription: p.shortDescription,
        variantLabel: p.variantLabel,
        priceKes: p.priceKes,
        compareAtPriceKes: p.compareAtPriceKes,
        bestSeller: p.bestSeller,
        ratingAvg: p.ratingAvg,
        ratingCount: p.ratingCount,
        primaryImageUrl: primary ? r2PublicUrl(primary.objectKey) : "/img/placeholder.png",
        categoryName: p.category.name,
        categorySlug: p.category.slug,
        stock: p.stock,
      };
    });

    return ok({ products });
  } catch (e) {
    console.error("[favorites] GET error", e);
    return Err.internal();
  }
}

const ToggleSchema = z.object({ productId: z.string().uuid() });

export async function POST(req: NextRequest) {
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) return Err.authRequired();

    const body = await req.json().catch(() => ({}));
    const parsed = ToggleSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const { productId } = parsed.data;
    const userId = session.user.id;

    const existing = await db.favorite.findUnique({
      where: { userId_productId: { userId, productId } },
    });

    if (existing) {
      await db.favorite.delete({ where: { userId_productId: { userId, productId } } });
      return ok({ favorited: false });
    } else {
      await db.favorite.create({ data: { userId, productId } });
      return ok({ favorited: true });
    }
  } catch (e) {
    console.error("[favorites] POST error", e);
    return Err.internal();
  }
}
