/**
 * Temporary rollout flag: real per-branch Daraja/KCB credentials only exist
 * for Nairobi and Nakuru today (see lib/payments/mpesa/gateway.ts), so Kenya
 * delivery is limited to the 5 branch pickup/delivery areas rather than the
 * full 47-county list until every branch has its own credentials. Flip
 * DELIVERY_MODE=FULL_COUNTY (one env var, no code change) once they do.
 *
 * Mirrors the DARAJA_ENABLED on/off-by-env pattern in
 * lib/payments/mpesa/gateway.ts for consistency.
 */
export function isBranchLimitedDelivery(): boolean {
  return process.env.DELIVERY_MODE !== "FULL_COUNTY";
}
