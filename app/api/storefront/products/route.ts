import { NextRequest } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { getProducts } from "@/lib/queries/products";
import { ok, Err } from "@/lib/api";

export async function GET(req: NextRequest) {
  noStore();
  try {
    const sp = req.nextUrl.searchParams;
    const category = sp.get("category") ?? undefined;
    const sort = (sp.get("sort") ?? "newest") as "newest" | "price_asc" | "price_desc" | "best";
    const cursor = sp.get("cursor") ?? undefined;
    const limit = Math.min(Number(sp.get("limit") ?? 12), 48);

    const result = await getProducts({ category, sort, cursor, limit });
    return ok(result);
  } catch (e) {
    console.error("[products] GET error", e);
    return Err.internal();
  }
}
