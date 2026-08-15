// ---------------------------------------------------------------------------
// In-store order numbers — deliberately independent of
// lib/orders/generate-order-number.ts (that file powers the customer
// checkout flow and has been the source of several recent bugs; in-store
// orders must not risk breaking it, and must not risk being broken by it).
//
// Why it exists: an admin creating a walk-in order at a branch till needs a
// human-readable, customer-facing receipt number the instant the order is
// created — there is no async payment-success step to defer assignment to
// (see markInStorePaymentSuccess, which does NOT (re)assign one).
// ---------------------------------------------------------------------------

/**
 * Builds a deterministic in-store order number encoding the branch and the
 * exact moment of creation, in EAT (Africa/Nairobi, fixed UTC+3 — Kenya has
 * no DST).
 *
 * Format: #STORE-<last 3 chars of branch id><YYMMDDHHmmss>
 *
 * @param date - The moment the order was created
 * @param branchId - The id of the branch that created the order
 * @returns A "#STORE-..." order number
 *
 * @remarks Kept to 22 chars total: the initiate routes derive Daraja's
 * AccountReference from this via two chained `.slice()` calls
 * (`orderNumber.slice(7, -1)` then `stk-push.ts`'s `.slice(4, -1)`), and
 * Daraja rejects an AccountReference over 12 chars — don't add more entropy
 * here without checking that math still lands under the cap.
 *
 * @remarks No uniqueness retry loop — second resolution scoped to a
 * single branch's admin flow makes a same-second collision practically
 * impossible. A genuine collision would surface as a DB unique constraint
 * error from inStoreOrder.create(), which the caller already runs inside a
 * try/catch.
 */
export function buildInStoreOrderNumber(date: Date, branchId: string | null): string {
  const eat = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");

  const yy = pad(eat.getUTCFullYear() % 100);
  const mm = pad(eat.getUTCMonth() + 1);
  const dd = pad(eat.getUTCDate());
  const hh = pad(eat.getUTCHours());
  const min = pad(eat.getUTCMinutes());
  const ss = pad(eat.getUTCSeconds());

  const branchTag = (branchId ?? "").slice(-3).toUpperCase();

  return `#STORE-${branchTag}${yy}${mm}${dd}${hh}${min}${ss}`;
}
