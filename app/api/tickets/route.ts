import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ok, created, Err } from "@/lib/api";
import { z } from "zod";
import { NextRequest } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { generateTicketNumber } from "@/lib/tickets/generate-ticket-number";
import { assignTicketToAdmin } from "@/lib/tickets/assign-admin";
import { createNotification } from "@/lib/notify";

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return db.user.findUnique({ where: { id: session.user.id } });
}

// 48 hours — initial ticket expiry window
const TICKET_EXPIRY_MS = 48 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// GET /api/tickets
// Returns all tickets belonging to the authenticated user.
// ---------------------------------------------------------------------------
export async function GET() {
  await connection();
  try {
    const user = await requireUser();
    if (!user) return Err.authRequired();

    const tickets = await db.supportTicket.findMany({
      where: { userId: user.id },
      orderBy: { lastActivityAt: "desc" },
      take: 100,
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        status: true,
        lastActivityAt: true,
        expiresAt: true,
        createdAt: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, senderType: true, createdAt: true },
        },
      },
    });

    return ok({ tickets });
  } catch (e) {
    console.error("[tickets] GET error", e);
    return Err.internal(e);
  }
}

// ---------------------------------------------------------------------------
// POST /api/tickets
// Body: { subject, content }
// Creates a new ticket with the first message from the customer.
// ---------------------------------------------------------------------------
const CreateSchema = z.object({
  subject: z.string().min(3).max(200),
  content: z.string().min(10).max(5000),
}).strict();

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const user = await requireUser();
    if (!user) return Err.authRequired();

    const body = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const ticketNumber = await generateTicketNumber();
    const assignedAdminId = await assignTicketToAdmin();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TICKET_EXPIRY_MS);

    const ticket = await db.supportTicket.create({
      data: {
        ticketNumber,
        userId: user.id,
        assignedAdminId,
        subject: parsed.data.subject,
        expiresAt,
        messages: {
          create: {
            senderType: "CUSTOMER",
            content: parsed.data.content,
          },
        },
      },
      include: {
        messages: true,
      },
    });

    console.info("[tickets] POST — created ticket", ticketNumber, "for user", user.id);
    createNotification({
      type: "TICKET_NEW",
      title: `New ticket: ${parsed.data.subject}`,
      body: `${user.name ?? user.email} opened ticket ${ticketNumber}`,
      link: `/admin/tickets/${ticket.id}`,
      targetRoles: ["customer_care"],
    }).catch(() => {});
    return created({ ticket });
  } catch (e) {
    console.error("[tickets] POST error", e);
    return Err.internal(e);
  }
}
