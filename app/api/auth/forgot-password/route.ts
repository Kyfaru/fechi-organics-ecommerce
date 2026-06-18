import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { createResetToken } from "@/lib/password-reset";
import { sendPasswordResetEmail } from "@/lib/email";

/**
 * POST /api/auth/forgot-password
 *
 * Accepts an email address and, if a non-admin user exists, sends a password
 * reset link via email. Always returns 200 to prevent email enumeration.
 * Rate-limited to 1 request per minute per email via Redis.
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      // Always 200 — never reveal whether the email is in our system.
      return NextResponse.json({ ok: true });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Rate limit: 1 request per minute per email to prevent spam.
    const redis = getRedis();
    const rateLimitKey = `pwreset:${normalizedEmail}`;
    const existing = await redis.get(rateLimitKey);
    if (existing) {
      return NextResponse.json({ ok: true }); // Silent throttle
    }
    await redis.set(rateLimitKey, "1", { ex: 60 });

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, role: true },
    });

    // Only send reset emails for non-admin users. Admins have their own flow.
    if (user && user.role !== "admin") {
      const token = await createResetToken(user.id);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const resetUrl = `${appUrl}/reset-password?token=${token}`;
      await sendPasswordResetEmail(user.email, resetUrl);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[forgot-password]", err);
    // Never reveal errors — always return 200.
    return NextResponse.json({ ok: true });
  }
}
