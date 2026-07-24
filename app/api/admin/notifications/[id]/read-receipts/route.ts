import { NextRequest, connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { requirePermission } from "@/lib/require-permission";
import { resolveNotificationScope } from "@/lib/notifications/scope";

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/admin/notifications/[id]/read-receipts — Super Admin/Admin ONLY.
// Enforced here, inside the handler — never just omitted from Manager/Staff UI.
export async function GET(req: NextRequest, { params }: Params) {
  await connection();
  const denied = await requirePermission(req, { notifications: ["view"] });
  if (denied) return denied;

  const resolved = await resolveNotificationScope(req);
  if (resolved instanceof Response) return resolved;
  const { scope } = resolved;

  if (scope.tier !== "global") return Err.forbidden();

  const { id } = await params;

  const states = await db.notificationRecipientState.findMany({
    where: { notificationId: id, readAt: { not: null } },
    orderBy: { readAt: "desc" },
  });

  const users = await db.user.findMany({
    where: { id: { in: states.map((s) => s.userId) } },
    select: { id: true, name: true, email: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return ok({
    receipts: states.map((s) => ({
      userId: s.userId,
      name: userMap.get(s.userId)?.name ?? userMap.get(s.userId)?.email ?? "Unknown",
      readAt: s.readAt,
    })),
  });
}
