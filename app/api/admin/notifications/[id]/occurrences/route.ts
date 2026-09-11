import { NextRequest, connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { requirePermission } from "@/lib/require-permission";
import { reportError } from "@/lib/observability";

// GET /api/admin/notifications/[id]/occurrences — the deduplicated
// notification's individual occurrences (who/what/when), for the "×N"
// stepper expansion in the admin notifications UI. See lib/notify.ts.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const denied = await requirePermission(req, { notifications: ["view"] });
    if (denied) return denied;

    const { id } = await params;

    const occurrences = await db.notificationOccurrence.findMany({
      where: { notificationId: id },
      orderBy: { occurredAt: "desc" },
      take: 50,
    });

    return ok({ occurrences });
  } catch (err) {
    reportError(err, { route: "GET /api/admin/notifications/[id]/occurrences", tags: { domain: "notifications" } });
    return Err.internal();
  }
}
