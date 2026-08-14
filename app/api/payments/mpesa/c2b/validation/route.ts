/**
 * POST /api/payments/mpesa/c2b/validation
 *
 * Safaricom's C2B Validation URL — called before a till/paybill payment is
 * accepted. We have no business rule to reject on (any amount/any payer is
 * fine for a walk-in till payment), so this always accepts. Public,
 * unauthenticated — Safaricom calls it directly.
 */
import { reportError } from "@/lib/observability";

export async function POST() {
  try {
    return Response.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });
  } catch (e) {
    reportError(e, { route: "POST /api/payments/mpesa/c2b/validation", tags: { stage: "handler" } });
    // Safaricom must not retry — always accept even if something above throws.
    return Response.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });
  }
}
