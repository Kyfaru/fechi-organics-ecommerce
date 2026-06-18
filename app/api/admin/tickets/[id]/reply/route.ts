import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { qstash } from "@/lib/qstash";
import { z } from "zod";
import { NextRequest } from "next/server";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = await db.user.findUnique({ where: { id: session.user.id } });
  return u?.role === "admin" ? u : null;
}

const ReplySchema = z.object({
  content: z.string().min(1).max(5000),
});

// 48 hours in milliseconds — each admin reply resets the expiry window
const REPLY_EXPIRY_MS = 48 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// POST /api/admin/tickets/[id]/reply
// Body: { content: string }
// Creates an ADMIN message, resets ticket expiry, enqueues email notification.
// ---------------------------------------------------------------------------
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const admin = await requireAdmin();
    if (!admin) return Err.forbidden();

    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const parsed = ReplySchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    // Load ticket to get user email and subject for the notification email
    const ticket = await db.supportTicket.findUnique({
      where: { id },
      select: {
        id: true,
        subject: true,
        status: true,
        user: { select: { email: true, name: true } },
      },
    });

    if (!ticket) return Err.notFound("Ticket");

    // Do not allow replies on expired tickets — admin must reopen first
    if (ticket.status === "EXPIRED") {
      return Err.validation("Cannot reply to an expired ticket. Reopen it first.");
    }

    const now = new Date();
    const newExpiry = new Date(now.getTime() + REPLY_EXPIRY_MS);

    // Create the message and reset expiry in a single transaction
    const [message] = await db.$transaction([
      db.ticketMessage.create({
        data: {
          ticketId: id,
          senderType: "ADMIN",
          content: parsed.data.content,
        },
      }),
      db.supportTicket.update({
        where: { id },
        data: { lastActivityAt: now, expiresAt: newExpiry, status: "OPEN" },
      }),
    ]);

    // Enqueue background email to the customer — fire-and-forget, non-blocking
    try {
      await qstash.publishJSON({
        url: `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/workers/send-ticket-email`,
        body: {
          ticketId: id,
          messageId: message.id,
          recipientEmail: ticket.user.email,
          recipientName: ticket.user.name,
          subject: `Re: ${ticket.subject}`,
          content: parsed.data.content,
        },
      });
    } catch (qstashErr) {
      // Non-fatal — message was saved, email delivery can be retried
      console.error("[admin/tickets/reply] Qstash enqueue failed", qstashErr);
    }

    console.info("[admin/tickets/[id]/reply] POST — message", message.id, "for ticket", id);
    return ok({ message });
  } catch (e) {
    console.error("[admin/tickets/[id]/reply] POST error", e);
    return Err.internal();
  }
}
