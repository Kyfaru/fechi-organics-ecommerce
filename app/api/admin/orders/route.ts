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
    } else {
      where.branchId = admin.adminProfile?.branchId ?? "__NO_BRANCH__";
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
        branch: { select: { id: true, name: true, county: true } },
        items: {
          include: {
            product: {
              select: {
                name: true,
                images: {
                  where: { isPrimary: true },
                  take: 1,
                  select: { objectKey: true },
                },
              },
            },
          },
        },
      },
    });

    console.info("[admin/orders] GET — returned", orders.length, "orders (page", page + 1, ")");
    return ok({
      orders,
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
