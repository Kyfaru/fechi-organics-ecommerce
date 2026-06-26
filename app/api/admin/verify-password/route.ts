import { NextRequest } from "next/server";
import { connection } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { Argon2id } from "oslo/password";

// POST /api/admin/verify-password — verify the calling admin's own password.
// Used as a gate before sensitive actions (reset another user's password, change role).
export async function POST(req: NextRequest) {
  await connection();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  const { password } = await req.json().catch(() => ({}));
  if (!password) return Err.validation("Password required");

  const account = await db.account.findFirst({
    where: { userId: session.user.id, providerId: "credential" },
    select: { password: true },
  });
  if (!account?.password) return Err.validation("No credential account found");

  const valid = await new Argon2id().verify(account.password, password);
  if (!valid) return Err.validation("Incorrect password");

  return ok({ verified: true });
}
