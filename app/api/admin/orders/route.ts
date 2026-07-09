import { NextRequest } from "next/server";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------
async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { adminProfile: true },
  });
  return user?.role === "admin" ? user : null;
}

// ---------------------------------------------------------------------------
// GET /api/admin/orders
// Returns orders ordered newest-first with user + items (including product images)
// Supports: ?status=SHIPPED&search=abc&page=1
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  await connection();
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search");
    const branchId = url.searchParams.get("branchId");
    const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10));
    const pageSize = 50;

    const where: Record<string, unknown> = {};

    if (status) {
      where.status = status;
    }

    if (admin.adminProfile?.isSuperAdmin) {
      if (branchId) where.branchId = branchId;
    } else if (admin.adminProfile?.branchId) {
      where.branchId = admin.adminProfile.branchId;
    }

    if (search) {
      where.OR = [
        { id: { contains: search, mode: "insensitive" } },
        { guestEmail: { contains: search, mode: "insensitive" } },
        { user: { OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ]}},
      ];
    }

    const orders = await db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * pageSize,
      take: pageSize,
      include: {
        user: { select: { name: true, email: true } },
        branch: { select: { id: true, name: true, county: true, phone: true } },
        transactions: { orderBy: { createdAt: "desc" }, take: 1, select: { provider: true } },
        items: {
          include: {
            product: {
              select: {
                name: true,
                // Fetch all images ordered by sortOrder so primary (sortOrder 0)
                // comes first. No isPrimary filter — products with no primary
                // image still get their first image shown in the order card.
                images: {
                  orderBy: { sortOrder: "asc" },
                  select: { objectKey: true, isPrimary: true },
                },
              },
            },
          },
        },
      },
    });

    // Shape to expose fulfillment fields at the top level
    const shaped = orders.map((o) => ({
      ...o,
      orderNumber: o.orderNumber,
      processingBy: o.processingBy,
      processedAt: o.processedAt,
      confirmedBy: o.confirmedBy,
      confirmedAt: o.confirmedAt,
      shippedAt: o.shippedAt,
    }));

    // ------------------------------------------------------------------
    // In-store orders — surfaced in the same list rather than a separate
    // page. Mirror the branch-scoping rule already computed above (`where`)
    // exactly: a branch-scoped admin must never see another branch's
    // in-store orders any more than they'd see another branch's regular
    // orders.
    // ------------------------------------------------------------------
    const inStoreWhere: Record<string, unknown> = {};
    if (where.branchId) inStoreWhere.branchId = where.branchId;

    // CONFIRMED and PICKED_UP are the only two InStoreFulfillmentStatus
    // values, and they happen to also be literal members of the customer
    // OrderStatus enum — when an admin filters by one of those two strings,
    // apply it to both tables. Any other status (PROCESSING, SHIPPED, etc.)
    // has no in-store equivalent, so in-store rows are simply excluded
    // instead of raising an error.
    let includeInStore = true;
    if (status) {
      if (status === "CONFIRMED" || status === "PICKED_UP") {
        inStoreWhere.fulfillmentStatus = status;
      } else {
        includeInStore = false;
      }
    }

    if (search) {
      inStoreWhere.OR = [
        { id: { contains: search, mode: "insensitive" } },
        { orderNumber: { contains: search, mode: "insensitive" } },
        { customerName: { contains: search, mode: "insensitive" } },
        { customerEmail: { contains: search, mode: "insensitive" } },
        { customerPhone: { contains: search, mode: "insensitive" } },
      ];
    }

    const inStoreOrders = includeInStore
      ? await db.inStoreOrder.findMany({
          where: inStoreWhere,
          orderBy: { createdAt: "desc" },
          take: pageSize,
          include: {
            branch: { select: { id: true, name: true, county: true, phone: true } },
            items: true,
            transactions: { orderBy: { createdAt: "desc" }, take: 1, select: { provider: true } },
          },
        })
      : [];

    // No real cross-table cursor pagination: the admin UI never pages past
    // page 0 in practice (DataTable does its own client-side pagination on
    // top of a single fetch), so "top pageSize from each table, merged and
    // re-sliced to pageSize" is correct and sufficient.
    const taggedOrders = shaped.map((o) => ({ ...o, kind: "order" as const }));
    const taggedInStore = inStoreOrders.map((o) => ({ ...o, kind: "instore" as const }));
    const merged = [...taggedOrders, ...taggedInStore]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, pageSize);

    console.info("[admin/orders] GET — returned", merged.length, "orders (page", page + 1, ")");
    return ok({
      orders: merged,
      scope: {
        isSuperAdmin: Boolean(admin.adminProfile?.isSuperAdmin),
        branchId: admin.adminProfile?.branchId ?? null,
      },
    });
  } catch (e) {
    console.error("[admin/orders] GET error", e);
    return Err.internal();
  }
}
