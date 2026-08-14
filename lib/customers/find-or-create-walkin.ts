/**
 * Resolves a walk-in customer entered during in-store order creation to a
 * real user (role: client) record, so they show up on /admin/customers
 * instead of only existing as inline fields on an inStoreOrder row.
 *
 * Dedups by phone (user.phone has no unique constraint, so this is a
 * best-effort match, not a DB-enforced one) — a repeat walk-in with the same
 * phone number reuses their existing customer record instead of creating a
 * duplicate. Email is optional; when omitted, a placeholder
 * "walkin-<id>@instore.local" address is used to satisfy user.email's
 * unique/required constraint without a schema change — the Customers admin
 * UI shows "No email" for these instead of the placeholder address.
 */

import { randomUUID } from "crypto";
import { db } from "@/lib/db";

export async function findOrCreateWalkInCustomer(input: {
  name?: string | null;
  phone: string;
  email?: string | null;
}): Promise<string> {
  const phone = input.phone.trim();
  const name = input.name?.trim();
  const email = input.email?.trim();

  const existing = await db.user.findFirst({
    where: { phone, role: "client" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const user = await db.user.create({
    data: {
      name: name || phone,
      phone,
      role: "client",
      email: email || `walkin-${randomUUID()}@instore.local`,
    },
  });
  await db.clientProfile.create({ data: { userId: user.id, source: "IN_STORE" } });
  return user.id;
}
