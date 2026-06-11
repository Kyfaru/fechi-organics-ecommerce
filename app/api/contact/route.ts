import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { ok, Err } from "@/lib/api";
import { Resend } from "resend";

const ContactSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  subject: z.string().min(2).max(200),
  message: z.string().min(10).max(2000),
});

export async function POST(req: NextRequest) {
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

    // Send notification email (async, best-effort)
    sendNotificationEmail({ name, email, subject, message, id: record.id }).catch((e) =>
      console.error("[contact] email send error", e)
    );

    return ok({ id: record.id });
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
