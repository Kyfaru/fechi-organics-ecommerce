/**
 * POST /api/payments/mpesa/c2b/validation
 *
 * Safaricom's C2B Validation URL — called before a till/paybill payment is
 * accepted. We have no business rule to reject on (any amount/any payer is
 * fine for a walk-in till payment), so this always accepts. Public,
 * unauthenticated — Safaricom calls it directly.
 */
export async function POST() {
  return Response.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });
}
