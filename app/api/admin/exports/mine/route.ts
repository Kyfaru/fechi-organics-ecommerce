/**
 * GET /api/admin/exports/mine — polling/refetch endpoint for the AdminHeader
 * export progress icon. Ownership-scoped to the caller only (no permission
 * check needed beyond being signed in — this never returns another staff
 * member's export). Returns the caller's most recent export that's either
 * still in flight or freshly ready and not yet delivered.
 */
import { NextRequest, connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { requireStaffSession, loadCallerContext } from "@/lib/require-permission";

export async function GET(req: NextRequest) {
  await connection();

  const denied = await requireStaffSession(req);
  if (denied) return denied;

  const ctx = await loadCallerContext();
  if (ctx.denied) return Err.authRequired();

  const exportRequest = await db.exportRequest.findFirst({
    where: {
      requestedByAdminProfileId: ctx.id,
      status: { in: ["PENDING", "GENERATING", "READY"] },
      deliveredAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, resource: true, format: true, status: true, fileName: true, fileSizeBytes: true, errorMessage: true },
  });

  return ok({ exportRequest });
}
