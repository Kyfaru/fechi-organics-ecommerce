import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { requireAdminPage } from "@/lib/admin-guard";

export async function GET(req: NextRequest) {
  await connection();
  const denied = await requireAdminPage(req, "dashboard");
  if (denied) return denied;

  const unreadOnly = req.nextUrl.searchParams.get("unread") === "true";

  const notifications = await db.notification.findMany({
    where: unreadOnly ? { read: false } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return ok({ notifications });
}
