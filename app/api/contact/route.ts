import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { ok, Err } from "@/lib/api";
import { Resend } from "resend";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { generateTicketNumber } from "@/lib/tickets/generate-ticket-number";
import { assignTicketToAdmin } from "@/lib/tickets/assign-admin";
import { sendTicketAcknowledgmentEmail } from "@/lib/email";

const ContactSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  subject: z.string().min(2).max(200),
  message: z.string().min(10).max(50000),
}).strict();

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = ContactSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const { name, email, phone, subject, message } = parsed.data;

    // Rate limit: 3 submissions per minute per IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const redis = getRedis();
    const rateKey = `fechi:ratelimit:contact:${ip}`;
    const count = await redis.incr(rateKey);
    if (count === 1) await redis.expire(rateKey, 60);
    if (count > 3) return Err.rateLimited();

    // Persist message
    const record = await db.contactMessage.create({
      data: { name, email, phone, subject, message },
    });

    // Always notify admin inbox — fire-and-forget, non-blocking
    db.notification
      .create({
        data: {
          type: "contact",
          title: `New contact: ${subject}`,
          body: `${name} (${email}) — ${message.slice(0, 120)}${message.length > 120 ? "…" : ""}`,
          link: `/admin/contacts`,
        },
      })
      .catch((e) => console.error("[contact] admin notification failed:", e));

    // Create a support ticket if the email matches a registered user. This is
    // awaited (not fire-and-forget) because the response needs the ticket
    // number so the contact form can show it to the customer. True guests
    // with no matching account get only the admin-notification path above —
    // no ticket, no acknowledgment email.
    let ticketNumber: string | undefined;
    try {
      const user = await db.user.findFirst({ where: { email } });
      if (user) {
        const generatedNumber = await generateTicketNumber();
        const assignedAdminId = await assignTicketToAdmin();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        const ticket = await db.supportTicket.create({
          data: {
            ticketNumber: generatedNumber,
            userId: user.id,
            assignedAdminId,
            subject,
            expiresAt,
            messages: {
              create: {
                senderType: "CUSTOMER",
                content: `${message}${phone ? `\n\nPhone: ${phone}` : ""}`,
              },
            },
          },
        });
        ticketNumber = ticket.ticketNumber;
        console.info("[contact] Support ticket created:", ticketNumber, "for user:", user.id);

        // Acknowledgment email — best-effort, doesn't block the response
        sendTicketAcknowledgmentEmail({
          email: user.email,
          name: user.name,
          ticketNumber,
          subject,
        }).catch((e) => console.error("[contact] acknowledgment email failed:", e));
      }
    } catch (e) {
      console.error("[contact] ticket creation failed:", e);
    }

    // Send notification email to admin (async, best-effort)
    sendNotificationEmail({ name, email, subject, message, id: record.id }).catch((e) =>
      console.error("[contact] email send error", e)
    );

    return ok({ id: record.id, ticketNumber });
  } catch (e) {
    console.error("[contact] POST error", e);
    return Err.internal();
  }
}

async function sendNotificationEmail(data: {
  name: string;
  email: string;
  subject: string;
  message: string;
  id: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@fechiorganics.com";

  if (!apiKey) {
    console.log("[contact] New message (no RESEND_API_KEY):", data);
    return;
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: "Fechi Organics <noreply@fechiorganics.com>",
    to: adminEmail,
    subject: `New contact: ${data.subject}`,
    html: `
      <h2>New Contact Message</h2>
      <p><strong>From:</strong> ${data.name} (${data.email})</p>
      <p><strong>Subject:</strong> ${data.subject}</p>
      <p><strong>Message:</strong></p>
      <blockquote>${data.message.replace(/\n/g, "<br>")}</blockquote>
      <p><small>Message ID: ${data.id}</small></p>
    `,
  });
}
