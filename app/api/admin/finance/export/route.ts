/**
 * POST /api/admin/finance/export
 *
 * Admin-only endpoint. Queries all transactions with associated order and user,
 * builds a CSV string, and returns it as a downloadable file.
 *
 * Generation is synchronous — dataset is bounded (transactions per store).
 * If volume grows beyond ~100k rows, convert to streaming CSV via a queue job.
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Err } from "@/lib/api";

async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  return user?.role === "admin" ? user : null;
}

export async function POST(req: NextRequest) {
  await connection();

  const admin = await requireAdmin(req);
  if (!admin) return Err.forbidden();

  try {
    const transactions = await db.transaction.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        order: {
          select: {
            id: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
    });

    // Build CSV — amounts are stored in cents, display as KES with 2dp
    const header = "ID,Order ID,Customer Name,Customer Email,Amount (KES),Provider,Status,Receipt,Date";
    const rows = transactions.map((tx) => {
      const orderId = tx.order?.id ?? "";
      const customerName = tx.order?.user?.name ?? "";
      const customerEmail = tx.order?.user?.email ?? "";
      const amountKes = (tx.amount / 100).toFixed(2);
      const receipt = tx.mpesaReceiptNumber ?? "";
      const date = tx.createdAt.toISOString();

      // Escape any field that might contain commas or quotes
      function esc(v: string) {
        if (v.includes(",") || v.includes('"') || v.includes("\n")) {
          return `"${v.replace(/"/g, '""')}"`;
        }
        return v;
      }

      return [
        esc(tx.id),
        esc(orderId),
        esc(customerName),
        esc(customerEmail),
        amountKes,
        tx.provider,
        tx.status,
        esc(receipt),
        date,
      ].join(",");
    });

    const csvString = [header, ...rows].join("\n");

    console.info(
      `[admin/finance/export] POST admin=${admin.id} rows=${transactions.length}`
    );

    return new Response(csvString, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="transactions-${Date.now()}.csv"`,
      },
    });
  } catch (e) {
    console.error("[admin/finance/export] POST error", e);
    return Err.internal();
  }
}
