import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { Argon2id } from "oslo/password";
import { checkPasswordChangeAllowed } from "@/lib/password-policy";

/**
 * POST /api/auth/reset-password
 *
 * Consumes the single-use reset-authorization token issued by
 * /api/auth/forgot-password/verify (Redis-backed, not a JWT — see that
 * route's comment) and updates the user's password hash. getdel makes the
 * consume step atomic: a token can never be used twice, even by two
 * concurrent requests.
 */
export async function POST(req: NextRequest) {
  try {
    const { resetAuth, newPassword } = await req.json();

    if (!resetAuth || typeof resetAuth !== "string" || !newPassword || typeof newPassword !== "string") {
      return NextResponse.json({ error: "Missing reset authorization or password" }, { status: 400 });
    }

    const redis = getRedis();
    const userId = await redis.getdel(`pwreset:auth:${resetAuth}`);
    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "Reset session expired or already used. Please start over." },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { passwordChanges: true, lastPasswordChange: true, createdAt: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const check = checkPasswordChangeAllowed(user);
    if (!check.allowed) {
      return NextResponse.json({ error: { code: check.reason, ...check } }, { status: 429 });
    }

    const hashedPassword = await new Argon2id().hash(newPassword);

    // Better Auth stores credentials in the account table with providerId = "credential".
    await db.account.updateMany({
      where: { userId, providerId: "credential" },
      data: { password: hashedPassword },
    });
    await db.user.update({
      where: { id: userId },
      data: { passwordChanges: { increment: 1 }, lastPasswordChange: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[reset-password]", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
