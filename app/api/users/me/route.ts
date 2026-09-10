import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAccountUser } from "@/lib/account/get-account-user";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { reportError } from "@/lib/observability";

// ---------------------------------------------------------------------------
// GET /api/users/me — fetch the authenticated user's account profile fresh
// from the DB. Backs the ["profile"] TanStack Query used by ProfileForm,
// AccountSidebar and BotanicalDashboardCard so a save in one place shows up
// immediately everywhere else (see lib/account/profile-query.ts).
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) return Err.authRequired();

    const user = await getAccountUser(session.user.id);
    if (!user) return Err.notFound("User");

    return ok(user);
  } catch (e) {
    console.error("[users/me] GET error", e);
    reportError(e, { route: "GET /api/users/me" });
    return Err.internal();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/users/me — update the authenticated user's profile fields.
// Only fields declared in additionalFields (lib/auth.ts) can be changed here.
// Email is managed by Better Auth and cannot be changed via this endpoint.
// ---------------------------------------------------------------------------

const UpdateProfileSchema = z.object({
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  phone: z.string().max(30).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(2).optional(), // ISO 3166-1 alpha-2
}).strict();

export async function PATCH(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) return Err.authRequired();

    const body = await req.json().catch(() => ({}));
    const parsed = UpdateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return Err.validation(parsed.error.issues[0].message);
    }

    const { firstName, lastName, phone, city, country } = parsed.data;

    // Build the update payload — only include fields present in the request body
    // so we don't accidentally nullify fields the client didn't send.
    const data: Record<string, string | undefined> = {};
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (phone !== undefined) data.phone = phone;
    if (city !== undefined) data.city = city;
    if (country !== undefined) data.country = country;

    // Also sync the `name` field if both first/last were provided
    if (firstName !== undefined && lastName !== undefined) {
      data.name = `${firstName} ${lastName}`.trim();
    }

    await db.user.update({
      where: { id: session.user.id },
      data,
    });

    console.info("[users/me] Profile updated for user", session.user.id);
    return ok({ updated: true });
  } catch (e) {
    console.error("[users/me] PATCH error", e);
    reportError(e, { route: "PATCH /api/users/me" });
    return Err.internal();
  }
}
