import { NextRequest } from "next/server";
import { connection } from "next/server";
import { getProducts } from "@/lib/queries/products";
import { ok, Err } from "@/lib/api";
import { reportError } from "@/lib/observability";

export async function GET(req: NextRequest) {
  await connection();
  try {
    const sp = req.nextUrl.searchParams;
    const category = sp.get("category") ?? undefined;
    const sort = (sp.get("sort") ?? "newest") as "newest" | "price_asc" | "price_desc" | "best";
    const cursor = sp.get("cursor") ?? undefined;
    const limit = Math.min(Number(sp.get("limit") ?? 12), 48);
    const search = sp.get("q") ?? undefined;

    const result = await getProducts({ category, sort, cursor, limit, search });
    return ok(result);
  } catch (e) {
    console.error("[products] GET error", e);
    reportError(e, { route: "GET /api/storefront/products" });
    return Err.internal();
  }
}
