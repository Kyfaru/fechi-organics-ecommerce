import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { connection, NextRequest } from "next/server";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { sendSms } from "@/lib/twilio";
import { Resend } from "resend";
import { z } from "zod";

const resend = new Resend(process.env.RESEND_API_KEY);

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = await db.user.findUnique({ where: { id: session.user.id } });
  return u?.role === "admin" ? u : null;
}

const BodySchema = z.object({
  message: z.string().min(1).max(2000),
  channels: z.array(z.enum(["EMAIL", "SMS", "INBOX"])).min(1),
});

/**
 * POST /api/admin/testimonials/[id]/message — personalized one-off outreach
 * to a testimony giver. A single-recipient send, so it calls Resend/Twilio/
 * inboxMessage directly here rather than going through the campaign+QStash
 * pipeline built for bulk sends.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  try {
    const admin = await requireAdmin();
    if (!admin) return Err.forbidden();

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);
    const { message, channels } = parsed.data;

    const testimonial = await db.testimonial.findUnique({ where: { id } });
    if (!testimonial) return Err.notFound("Testimonial");

    const user = testimonial.userId
      ? await db.user.findUnique({ where: { id: testimonial.userId }, select: { id: true, email: true, phone: true, name: true } })
      : null;

    const email = user?.email ?? testimonial.contactEmail ?? null;
    const phone = user?.phone ?? testimonial.contactPhone ?? null;

    const results: Record<string, "sent" | "skipped" | "failed"> = {};

    if (channels.includes("EMAIL")) {
      if (!email) {
        results.EMAIL = "skipped";
      } else {
        try {
          await resend.emails.send({
            from: process.env.EMAIL_FROM!,
            to: email,
            subject: "A message from Fechi Organics",
            html: `<p>Hi ${testimonial.authorName},</p><p>${message.replace(/\n/g, "<br>")}</p><p>— Fechi Organics</p>`,
          });
          results.EMAIL = "sent";
        } catch (err) {
          console.error("[testimonials/message] email failed:", err);
          results.EMAIL = "failed";
        }
      }
    }

    if (channels.includes("SMS")) {
      if (!phone) {
        results.SMS = "skipped";
      } else {
        try {
          await sendSms(phone, message);
          results.SMS = "sent";
        } catch (err) {
          console.error("[testimonials/message] sms failed:", err);
          results.SMS = "failed";
        }
      }
    }

    if (channels.includes("INBOX")) {
      if (!user) {
        results.INBOX = "skipped";
      } else {
        try {
          await db.inboxMessage.create({
            data: { userId: user.id, type: "SYSTEM", title: "A message from Fechi Organics", body: message },
          });
          results.INBOX = "sent";
        } catch (err) {
          console.error("[testimonials/message] inbox failed:", err);
          results.INBOX = "failed";
        }
      }
    }

    return ok({ results });
  } catch (e) {
    console.error("[admin/testimonials/message] POST error", e);
    return Err.internal();
  }
}
