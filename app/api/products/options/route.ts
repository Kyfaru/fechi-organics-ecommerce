import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { r2PublicUrl } from "@/lib/r2";

/**
 * GET /api/products/options?q=<search> — lightweight product list for
 * pickers (e.g. the create-testimony product multi-select). Public: no
 * auth required, only active products, minimal fields.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  const products = await db.product.findMany({
    where: {
      isActive: true,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    select: {
      id: true,
      name: true,
      category: { select: { name: true } },
      images: {
        where: { isPrimary: true },
        select: { objectKey: true },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
    take: 100,
  });

  return NextResponse.json({
    ok: true,
    data: products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category.name,
      image: p.images[0]?.objectKey ? r2PublicUrl(p.images[0].objectKey) : null,
    })),
  });
}
