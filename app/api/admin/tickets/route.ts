import { db } from "@/lib/db";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";

// ---------------------------------------------------------------------------
// GET /api/admin/tickets
// Query params: status (open|resolved|expired), assignedAdminId (user id, or
// "unassigned" to find tickets with no assignee)
// Returns all tickets with user info and last message preview.
// Bulk-expires overdue tickets before responding.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { tickets: ["view"] });
  if (denied) return denied;

  try {
    // Bulk-expire tickets whose expiresAt has passed
    await db.supportTicket.updateMany({
      where: { expiresAt: { lt: new Date() }, status: "OPEN" },
      data: { status: "EXPIRED" },
    });

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status")?.toUpperCase();
    const assignedAdminId = searchParams.get("assignedAdminId");

    const where: Record<string, unknown> = {};
    if (statusParam && ["OPEN", "RESOLVED", "EXPIRED"].includes(statusParam)) {
      where.status = statusParam;
    }
    if (assignedAdminId === "unassigned") {
      where.assignedAdminId = null;
    } else if (assignedAdminId) {
      where.assignedAdminId = assignedAdminId;
    }

    const tickets = await db.supportTicket.findMany({
      where,
      orderBy: { lastActivityAt: "desc" },
      take: 200,
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        status: true,
        lastActivityAt: true,
        expiresAt: true,
        createdAt: true,
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        assignedAdmin: {
          select: { id: true, name: true },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, senderType: true, createdAt: true },
        },
      },
    });

    return ok({ tickets });
  } catch (e) {
    console.error("[admin/tickets] GET error", e);
    return Err.internal(e);
  }
}
