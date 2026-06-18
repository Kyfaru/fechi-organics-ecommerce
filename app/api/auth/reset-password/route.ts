import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyResetToken } from "@/lib/password-reset";
import { Argon2id } from "oslo/password";

/**
 * POST /api/auth/reset-password
 *
 * Verifies the JWT reset token and updates the user's password hash.
 * Returns structured errors on failure so the client can show a useful message.
 */
export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();

    if (!token || typeof token !== "string" || !password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Missing token or password" },
        { status: 400 }
      );
    }

    const verified = await verifyResetToken(token);
    if (!verified) {
      return NextResponse.json(
        { error: "Invalid or expired reset link" },
        { status: 400 }
      );
    }

    const hashedPassword = await new Argon2id().hash(password);

    // Better Auth stores credentials in the account table with providerId = "credential".
    await db.account.updateMany({
      where: { userId: verified.userId, providerId: "credential" },
      data: { password: hashedPassword },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[reset-password]", err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
