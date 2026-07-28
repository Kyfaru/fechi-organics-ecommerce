import { zohoGet, zohoPost } from "@/lib/zoho";

// UNVERIFIED — response/request field names below (contacts[], contact_id,
// contact_name) follow Zoho Books' documented shape but haven't been checked
// against a live payload. Confirm during implementation.
type ZohoContact = { contact_id: string; email?: string | null };
type ZohoContactsResponse = { contacts?: ZohoContact[] };
type ZohoContactResponse = { contact?: ZohoContact };

/**
 * Finds (or creates) a Zoho Books Contact to use as a Sales Receipt's
 * customer_id. Books hard-requires a real contact_id — unlike Zoho
 * Inventory's Sales Order shape, which took free-text customer_name/email
 * directly — so this resolves one before every sales-receipt push.
 *
 * Books' server-side `email=` filtering on GET /contacts isn't confirmed in
 * public docs, so the response is treated as a candidate list and matched
 * client-side (case-insensitive, exact) rather than trusted outright — safe
 * whether the server-side filter is exact, fuzzy, or a no-op.
 *
 * Never resolves to "not found": falls back to creating a contact with
 * whatever name/email is available, since a Sales Receipt cannot be created
 * without one. Real Zoho API errors propagate to the caller — same
 * error contract as resolve-org.ts — so the caller's existing
 * recordZohoPush FAILED path handles them.
 */
export async function resolveZohoCustomer(
  organizationId: string,
  args: { email?: string | null; name?: string | null },
): Promise<{ contactId: string }> {
  const email = args.email?.trim() || undefined;

  if (email) {
    const res = await zohoGet<ZohoContactsResponse>(organizationId, "/contacts", { email });
    const match = res.contacts?.find(
      (c) => c.email?.trim().toLowerCase() === email.toLowerCase(),
    );
    if (match) return { contactId: match.contact_id };
  }

  const created = await zohoPost<ZohoContactResponse>(organizationId, "/contacts", {
    contact_name: args.name?.trim() || email || "Website Customer",
    ...(email ? { email } : {}),
  });

  if (!created.contact?.contact_id) {
    throw new Error("[zoho/resolve-customer] Contact creation returned no contact_id");
  }

  return { contactId: created.contact.contact_id };
}
