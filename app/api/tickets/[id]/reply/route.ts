import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { qstash } from "@/lib/qstash";
import { z } from "zod";
import { NextRequest } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { getRedis } from "@/lib/redis";
import { ticketChannel } from "@/lib/ticket-channel";

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return db.user.findUnique({ where: { id: session.user.id } });
}

const ReplySchema = z.object({
  content: z.string().min(1).max(5000),
}).strict();

// Each customer reply extends the window by 48 hours
const REPLY_EXPIRY_MS = 48 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// POST /api/tickets/[id]/reply
// Body: { content: string }
// Adds a CUSTOMER message and notifies admin via Qstash.
// ---------------------------------------------------------------------------
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const user = await requireUser();
    if (!user) return Err.authRequired();

    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const parsed = ReplySchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    // Load ticket to verify ownership and status
    const ticket = await db.supportTicket.findUnique({
      where: { id },
      select: { id: true, userId: true, subject: true, status: true },
    });

    if (!ticket) return Err.notFound("Ticket");
    if (ticket.userId !== user.id) return Err.forbidden();

    if (ticket.status === "RESOLVED") {
      return Err.validation("This ticket has been resolved. Open a new ticket if you need further help.");
    }

    if (ticket.status === "EXPIRED") {
      return Err.validation("This ticket has expired. Please open a new ticket.");
    }

    const now = new Date();
    const newExpiry = new Date(now.getTime() + REPLY_EXPIRY_MS);

    const [message] = await db.$transaction([
      db.ticketMessage.create({
        data: {
          ticketId: id,
          senderType: "CUSTOMER",
          content: parsed.data.content,
        },
      }),
      db.supportTicket.update({
        where: { id },
        data: { lastActivityAt: now, expiresAt: newExpiry },
      }),
    ]);

    // Notify admin in background — non-fatal if Qstash fails
    try {
      await qstash.publishJSON({
        url: `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/workers/send-ticket-admin-notify`,
        body: {
          ticketId: id,
          messageId: message.id,
          customerName: user.name,
          subject: ticket.subject,
          content: parsed.data.content,
        },
      });
    } catch (qstashErr) {
      console.error("[tickets/reply] Qstash enqueue failed", qstashErr);
    }

    // Notify any open SSE stream on this ticket — best-effort, non-blocking
    try {
      await getRedis().set(
        ticketChannel(id),
        JSON.stringify({ type: "new_message", messageId: message.id, senderType: "CUSTOMER" }),
        { ex: 30 }
      );
    } catch (redisErr) {
      console.error("[tickets/reply] Redis publish failed", redisErr);
    }

    return ok({ message });
  } catch (e) {
    console.error("[tickets/[id]/reply] POST error", e);
    return Err.internal();
  }
}
