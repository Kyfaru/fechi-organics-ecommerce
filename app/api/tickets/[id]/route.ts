import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { NextRequest } from "next/server";

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return db.user.findUnique({ where: { id: session.user.id } });
}

// ---------------------------------------------------------------------------
// GET /api/tickets/[id]
// Returns full ticket with all messages — only if the user owns it.
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const user = await requireUser();
    if (!user) return Err.authRequired();

    const { id } = await params;

    const ticket = await db.supportTicket.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!ticket) return Err.notFound("Ticket");

    // Ownership check — customers can only read their own tickets
    if (ticket.userId !== user.id) return Err.forbidden();

    return ok({ ticket });
  } catch (e) {
    console.error("[tickets/[id]] GET error", e);
    return Err.internal();
  }
}
