/**
 * Resolves a guest checkout (name/email/phone typed into components/checkout/DeliveryClient.tsx
 * with no session) to a real `user` row, so `order.userId` is never null for a
 * guest order and the customer shows up on /admin/customers like any other.
 *
 * Mirrors lib/customers/find-or-create-walkin.ts (the in-store "walk-in
 * customer" pattern) but is kept as a separate function rather than a shared
 * `source` param, because the two have different trust models: a walk-in is
 * entered by trusted staff, while a guest checkout is unauthenticated public
 * input, which needs the email-takeover guard below.
 *
 * Dedup order is email-first (guest checkout always has a real, required
 * email — unlike a walk-in), phone as a best-effort fallback (user.phone has
 * no unique constraint, see find-or-create-walkin.ts).
 *
 * Security: a match is only ever reused when the existing row has no
 * `account` row of its own (i.e. it's a previous guest/walk-in placeholder
 * that nobody can log into). Reusing a row that DOES have an account would
 * let anyone silently attach a paid order to a stranger's real, logged-in
 * account just by typing their email at checkout — this guest checkout adds
 * no verification of email ownership, so callers must reject that case
 * instead (see the "email_taken" result) rather than route.ts/checkout
 * proceeding as if it were fine.
 */

import { db } from "@/lib/db";
import { err } from "@/lib/api";
import { isGuestMigrationLocked } from "@/lib/customers/guest-migration-lock";
import { recordSignal } from "@/lib/points/anti-abuse";

export type GuestCustomerResult =
  | { status: "resolved"; userId: string }
  | { status: "email_taken" }
  | { status: "migration_in_progress" };

async function hasAccount(userId: string): Promise<boolean> {
  const account = await db.account.findFirst({ where: { userId }, select: { id: true } });
  return account !== null;
}

export async function findOrCreateGuestCustomer(input: {
  name: string;
  email: string;
  phone: string;
}): Promise<GuestCustomerResult> {
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const name = input.name.trim() || phone;

  const existingByEmail = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existingByEmail) {
    if (await hasAccount(existingByEmail.id)) return { status: "email_taken" };
    return { status: "resolved", userId: existingByEmail.id };
  }

  // The email can look "free" here for a reason other than nobody having
  // used it: lib/auth.ts's signup-merge hook renames an accountless guest
  // row's email away mid-signup, right before that same email's new account
  // is created. Creating a brand-new guest row in that narrow window would
  // orphan whichever of the two never gets merged — refuse instead, so the
  // checkout UI can ask the customer to retry in a moment (this lock is
  // held for at most ~15s, one signup request's worth).
  if (await isGuestMigrationLocked(email)) {
    return { status: "migration_in_progress" };
  }

  const existingByPhone = await db.user.findFirst({
    where: { phone, role: "client" },
    select: { id: true },
  });
  if (existingByPhone && !(await hasAccount(existingByPhone.id))) {
    return { status: "resolved", userId: existingByPhone.id };
  }

  const user = await db.user.create({
    data: { name, phone, email, role: "client" },
  });
  await db.clientProfile.create({ data: { userId: user.id, source: "ONLINE_GUEST" } });
  return { status: "resolved", userId: user.id };
}

/**
 * Shared by every payment-initiate route (mpesa/kcb/paystack/points) to turn
 * either a real session or a guest's typed-in contact details into the
 * `userId` that owns the order about to be created. Kept in one place so the
 * guest-vs-session branch and the "email already has a real account" guard
 * (see findOrCreateGuestCustomer's docstring) can't drift across routes.
 */
export async function resolveCheckoutUserId(
  session: { user: { id: string } } | null | undefined,
  contact: { fullName: string; email?: string | null; phone: string },
  deviceId?: string | null,
): Promise<{ userId: string } | { error: Response }> {
  if (session?.user) return { userId: session.user.id };

  if (!contact.email?.trim()) {
    return { error: err("VALIDATION", "Email is required to check out as a guest", 400) };
  }

  const guest = await findOrCreateGuestCustomer({
    name: contact.fullName,
    email: contact.email,
    phone: contact.phone,
  });
  if (guest.status === "email_taken") {
    return {
      error: err(
        "EMAIL_HAS_ACCOUNT",
        "An account already exists with this email. Please sign in to continue.",
        409,
      ),
    };
  }
  if (guest.status === "migration_in_progress") {
    return {
      error: err(
        "RETRY_SHORTLY",
        "We're finishing setting up an account for this email — please try again in a few seconds.",
        409,
      ),
    };
  }

  // Tags this guest's account with the browser that checked out. When they
  // later log into (or sign up for) a real account from the same browser —
  // even with a different email — lib/auth.ts's mergeGuestOrdersByDevice
  // reads this same signal back to silently reattach their orders.
  if (deviceId) await recordSignal(guest.userId, "DEVICE", deviceId);

  return { userId: guest.userId };
}
