/**
 * Paystack takes a cut of every card charge. We pass it on to the customer as a
 * separate "card processing fee" line so the order total nets to us in full.
 *
 * Pure and dependency-free — imported by both the checkout UI (preview) and the
 * Paystack initialize route (authoritative), so the two agree to the cent.
 *
 * "International" is the delivery country, the same proxy card-eligibility.ts
 * uses — the issuing country of the card isn't known until Paystack's hosted
 * page, after the amount is already fixed.
 */

export const LOCAL_CARD_FEE_RATE = 0.03;
export const INTL_CARD_FEE_RATE = 0.04;

/** Fee in integer cents on top of an amount that already has coupon/points applied. */
export function cardFeeCents(preFeeTotalCents: number, isInternational: boolean): number {
  if (preFeeTotalCents <= 0) return 0;
  return Math.round(preFeeTotalCents * (isInternational ? INTL_CARD_FEE_RATE : LOCAL_CARD_FEE_RATE));
}
