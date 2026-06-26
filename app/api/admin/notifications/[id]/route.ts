import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { requireAdminPage } from "@/lib/admin-guard";

interface Params { params: Promise<{ id: string }> }

// PATCH /api/admin/notifications/[id] — mark single notification read
// PATCH /api/admin/notifications/all — mark all read (id = "all")
export async function PATCH(req: NextRequest, { params }: Params) {
  await connection();
  const denied = await requireAdminPage(req, "dashboard");
  if (denied) return denied;

  const { id } = await params;

  if (id === "all") {
    await db.notification.updateMany({ where: { read: false }, data: { read: true } });
    return ok({ marked: "all" });
  }

  const notification = await db.notification.update({
    where: { id },
    data: { read: true },
  });
  return ok({ notification });
}
