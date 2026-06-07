import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return Err.forbidden();
    const user = await db.user.findUnique({ where: { id: session.user.id } });
    if (user?.role !== "admin") return Err.forbidden();

    const unread = await db.contactMessage.count({ where: { status: "new" } });
    return ok({ unread });
  } catch (e) {
    console.error("[admin/contact-messages/count] GET error", e);
    return Err.internal();
  }
}
