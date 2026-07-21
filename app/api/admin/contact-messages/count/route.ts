import { NextRequest } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { requirePermission } from "@/lib/require-permission";

export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { contact_messages: ["view"] });
  if (denied) return denied;

  try {
    const unread = await db.contactMessage.count({ where: { status: "new" } });
    return ok({ unread });
  } catch (e) {
    console.error("[admin/contact-messages/count] GET error", e);
    return Err.internal(e);
  }
}
