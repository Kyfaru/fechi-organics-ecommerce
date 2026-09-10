import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { Argon2id } from "oslo/password";
import { reportError } from "@/lib/observability";

/**
 * POST /api/account/set-password
 *
 * For OAuth-only accounts (no existing credential account) setting a
 * password for the first time. Better Auth 1.6.14's own `/set-password`
 * HTTP endpoint never mounts a route (its handler is defined without a path
 * — see node_modules/.pnpm/better-auth@.../dist/api/routes/update-user.mjs,
 * compare `setPassword` to `changePassword`/`deleteUser` which do pass one),
 * so calling it always 404s. This route replicates the same DB write
 * `auth.api.setPassword` would have made, following the same pattern
 * app/api/auth/reset-password/route.ts already uses to write credential
 * passwords directly instead of through Better Auth's HTTP API.
 */
export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    if (newPassword.length > 128) {
      return NextResponse.json({ error: "Password is too long" }, { status: 400 });
    }

    const existing = await db.account.findFirst({
      where: { userId: session.user.id, providerId: "credential" },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: "A password is already set on this account" }, { status: 400 });
    }

    const hashedPassword = await new Argon2id().hash(newPassword);

    await db.account.create({
      data: {
        id: crypto.randomUUID(),
        userId: session.user.id,
        accountId: session.user.id,
        providerId: "credential",
        password: hashedPassword,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[account/set-password]", err);
    reportError(err, { route: "POST /api/account/set-password", tags: { flow: "account-set-password" } });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
