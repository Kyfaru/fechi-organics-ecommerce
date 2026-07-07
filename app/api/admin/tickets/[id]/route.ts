import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { z } from "zod";
import { NextRequest } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = await db.user.findUnique({ where: { id: session.user.id } });
  return u?.role === "admin" ? u : null;
}

// ---------------------------------------------------------------------------
// GET /api/admin/tickets/[id]
// Returns the full ticket with all messages and user details.
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const admin = await requireAdmin();
    if (!admin) return Err.forbidden();

    const { id } = await params;

    const ticket = await db.supportTicket.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            country: true,
            createdAt: true,
          },
        },
        assignedAdmin: {
          select: { id: true, name: true },
        },
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!ticket) return Err.notFound("Ticket");

    return ok({ ticket });
  } catch (e) {
    console.error("[admin/tickets/[id]] GET error", e);
    return Err.internal();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/tickets/[id]
// Body: { status: "OPEN" | "RESOLVED" }
// Updates ticket status.
// ---------------------------------------------------------------------------
const PatchSchema = z.object({
  status: z.enum(["OPEN", "RESOLVED"]),
}).strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const admin = await requireAdmin();
    if (!admin) return Err.forbidden();

    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const ticket = await db.supportTicket.update({
      where: { id },
      data: { status: parsed.data.status },
      select: { id: true, status: true, ticketNumber: true },
    });

    console.info("[admin/tickets/[id]] PATCH — status ->", ticket.status, "for", ticket.ticketNumber);
    return ok({ ticket });
  } catch (e) {
    console.error("[admin/tickets/[id]] PATCH error", e);
    return Err.internal();
  }
}
