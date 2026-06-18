/**
 * GET /api/admin/transactions
 *
 * Admin-only endpoint returning a paginated list of transactions, ordered
 * newest first. Includes the associated order and branch details.
 *
 * Query params:
 *   page (optional, default 1) — page number (1-indexed)
 *   pageSize (optional, default 50, max 100)
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";

// ---------------------------------------------------------------------------
// Auth helper — same pattern as app/api/admin/orders/route.ts
// ---------------------------------------------------------------------------
async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  return user?.role === "admin" ? user : null;
}

export async function GET(req: NextRequest) {
  await connection();

  const admin = await requireAdmin(req);
  if (!admin) return Err.forbidden();

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10)),
    );

    const [transactions, total] = await Promise.all([
      db.transaction.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          order: {
            select: {
              id: true,
              deliveryPhone: true,
              userId: true,
              user: { select: { name: true, email: true } },
            },
          },
          branch: {
            select: { id: true, name: true },
          },
        },
      }),
      db.transaction.count(),
    ]);

    console.info(
      `[admin/transactions] GET page=${page} pageSize=${pageSize} returned=${transactions.length}`,
    );

    return ok({
      transactions,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (e) {
    console.error("[admin/transactions] GET error", e);
    return Err.internal();
  }
}
