import { db } from "@/lib/db";
import { connection } from "next/server";
import { ok, Err } from "@/lib/api";
import { qstash } from "@/lib/qstash";
import { z } from "zod";
import { NextRequest } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { getRedis } from "@/lib/redis";
import { ticketChannel } from "@/lib/ticket-channel";
import { requirePermission } from "@/lib/require-permission";
import { uploadTicketAttachment, AttachmentValidationError, type TicketAttachment } from "@/lib/tickets/upload-attachment";

const ReplySchema = z.object({
  content: z.string().max(5000).optional(),
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
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { tickets: ["reply"] });
  if (denied) return denied;

  try {
    const { id } = await params;

    const formData = await req.formData().catch(() => null);
    if (!formData) return Err.validation("Invalid form data");

    const rawContent = formData.get("content");
    const parsed = ReplySchema.safeParse({
      content: typeof rawContent === "string" ? rawContent.trim() : undefined,
    });
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const file = formData.get("file");
    const hasFile = file instanceof File && file.size > 0;
    if (!parsed.data.content && !hasFile) {
      return Err.validation("Message cannot be empty");
    }

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

    let attachment: TicketAttachment | null = null;
    if (hasFile) {
      try {
        attachment = await uploadTicketAttachment(id, file as File);
      } catch (uploadErr) {
        if (uploadErr instanceof AttachmentValidationError) {
          return Err.validation(uploadErr.message);
        }
        throw uploadErr;
      }
    }

    const now = new Date();
    const newExpiry = new Date(now.getTime() + REPLY_EXPIRY_MS);

    // Create the message and reset expiry in a single transaction
    const [message] = await db.$transaction([
      db.ticketMessage.create({
        data: {
          ticketId: id,
          senderType: "ADMIN",
          content: parsed.data.content ?? "",
          ...attachment,
        },
      }),
      db.supportTicket.update({
        where: { id },
        data: { lastActivityAt: now, expiresAt: newExpiry, status: "OPEN" },
      }),
    ]);

    const notifyContent =
      parsed.data.content || (attachment ? `📎 Sent an attachment: ${attachment.attachmentName}` : "");

    // Fetch the customer's last message so the notification email can quote
    // it above the admin's new reply — gives the recipient context without
    // needing to click through to the thread.
    const lastCustomerMessage = await db.ticketMessage.findFirst({
      where: { ticketId: id, senderType: "CUSTOMER" },
      orderBy: { createdAt: "desc" },
      select: { content: true },
    });

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
          content: notifyContent,
          quotedContent: lastCustomerMessage?.content,
        },
      });
    } catch (qstashErr) {
      // Non-fatal — message was saved, email delivery can be retried
      console.error("[admin/tickets/reply] Qstash enqueue failed", qstashErr);
    }

    // Notify any open SSE stream on this ticket — best-effort, non-blocking
    try {
      await getRedis().set(
        ticketChannel(id),
        JSON.stringify({ type: "new_message", messageId: message.id, senderType: "ADMIN" }),
        { ex: 30 }
      );
    } catch (redisErr) {
      console.error("[admin/tickets/reply] Redis publish failed", redisErr);
    }

    console.info("[admin/tickets/[id]/reply] POST — message", message.id, "for ticket", id);
    return ok({ message });
  } catch (e) {
    console.error("[admin/tickets/[id]/reply] POST error", e);
    return Err.internal(e);
  }
}
