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
 * Format: #IS-<last 3 chars of branch shortcode><YYMMDDHHmmssSSS>
 *
 * @param date - The moment the order was created
 * @param branchShortcode - The till/paybill shortcode of the branch that created the order
 * @returns A "#IS-..." order number
 *
 * @remarks No uniqueness retry loop — millisecond resolution scoped to a
 * single branch's admin flow makes a same-millisecond collision practically
 * impossible. A genuine collision would surface as a DB unique constraint
 * error from inStoreOrder.create(), which the caller already runs inside a
 * try/catch.
 */
export function buildInStoreOrderNumber(date: Date, branchShortcode: string): string {
  const eat = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");

  const yy = pad(eat.getUTCFullYear() % 100);
  const mm = pad(eat.getUTCMonth() + 1);
  const dd = pad(eat.getUTCDate());
  const hh = pad(eat.getUTCHours());
  const min = pad(eat.getUTCMinutes());
  const ss = pad(eat.getUTCSeconds());
  const ms = pad(eat.getUTCMilliseconds(), 3);

  const branchSuffix = branchShortcode.slice(-3).toUpperCase();

  return `#IS-${branchSuffix}${yy}${mm}${dd}${hh}${min}${ss}${ms}`;
}
