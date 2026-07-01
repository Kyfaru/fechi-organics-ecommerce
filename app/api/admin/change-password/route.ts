import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Argon2id } from "oslo/password";
import { assertTrustedOrigin } from "@/lib/origin-check";

// POST /api/admin/change-password — used by the forced change-password screen.
// No token needed: the session already proves identity.
export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: { message: "Unauthorized" } }, { status: 401 });
  }

  const { newPassword } = await req.json().catch(() => ({}));
  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json({ ok: false, error: { message: "Password must be at least 8 characters" } }, { status: 400 });
  }

  const hashed = await new Argon2id().hash(newPassword);

  await db.account.updateMany({
    where: { userId: session.user.id, providerId: "credential" },
    data: { password: hashed },
  });

  await db.user.update({
    where: { id: session.user.id },
    data: { mustChangePassword: false },
  });

  return NextResponse.json({ ok: true });
}
