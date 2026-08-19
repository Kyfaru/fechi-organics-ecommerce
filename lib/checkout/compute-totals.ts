/**
 * Single implementation of order arithmetic.
 *
 * This block used to be copy-pasted across every payment-initiate route
 * (mpesa, paystack, kcb, mock, legacy POST /api/orders, and the three in-store
 * routes). Points redemption would have made that eight near-identical copies,
 * so it lives here once instead.
 *
 * Money is integer cents throughout, matching the rest of the codebase.
 */

import { Err } from "@/lib/api";
import { resolvePromo } from "@/lib/promo";
import { reportError } from "@/lib/observability";
import { getBalance, CENTS_PER_POINT } from "@/lib/points/ledger";

export type ComputeTotalsInput = {
  subtotalCents: number;
  /** Already resolved by the caller — online uses calculateDeliveryPricing, in-store reads DeliveryZone. */
  deliveryCents: number;
  promoCode?: string | null;
  /** Points the customer asked to spend. Ignored without a userId. */
  pointsRequested?: number;
  userId?: string | null;
  /**
   * Whether a coupon may eat into the delivery fee.
   *
   * true  — online checkout: max(0, subtotal + delivery - discount)
   * false — in-store: max(0, subtotal - discount) + delivery
   *
   * These two behaviours already differed before this refactor. Preserved
   * per-caller rather than unified, because either unification silently
   * changes what real customers are charged.
   */
  discountAppliesToDelivery?: boolean;
  /** Route name, for error reporting on a failed promo lookup. */
  route?: string;
};

export type OrderTotals = {
  subtotalCents: number;
  deliveryCents: number;
  discountCents: number;
  promoCode: string | null;
  promoId: string | null;
  pointsRedeemed: number;
  pointsDiscountCents: number;
  totalCents: number;
};

/**
 * How many points may be spent on a given cash amount, and what that is worth.
 * Exported so the quote endpoint and the checkout UI agree with the server to
 * the cent.
 */
export function applyPoints(
  grossCents: number,
  pointsRequested: number,
  availablePoints: number,
): { pointsRedeemed: number; pointsDiscountCents: number } {
  if (grossCents <= 0 || pointsRequested <= 0 || availablePoints <= 0) {
    return { pointsRedeemed: 0, pointsDiscountCents: 0 };
  }
  // Ceil so that spending enough points can zero the bill outright, rather than
  // leaving a sub-KSh-0.40 remainder that no number of points can clear.
  const pointsToClearBill = Math.ceil(grossCents / CENTS_PER_POINT);
  const pointsRedeemed = Math.min(pointsRequested, availablePoints, pointsToClearBill);
  const pointsDiscountCents = Math.min(pointsRedeemed * CENTS_PER_POINT, grossCents);
  return { pointsRedeemed, pointsDiscountCents };
}

/**
 * Resolves coupon and points against a cart and returns every money field an
 * order row needs.
 *
 * An invalid coupon is swallowed (discount stays 0), matching the behaviour
 * this replaced. An over-redemption of points is rejected outright — points are
 * a balance the customer can see, so silently charging them more than the
 * screen showed is worse than an error.
 */
export async function computeOrderTotals(input: ComputeTotalsInput): Promise<OrderTotals> {
  const {
    subtotalCents,
    promoCode: rawPromo,
    pointsRequested = 0,
    userId,
    discountAppliesToDelivery = true,
    route,
  } = input;

  let deliveryCents = input.deliveryCents;
  const promoCode = rawPromo?.trim().toUpperCase() || null;

  let discountCents = 0;
  let promoId: string | null = null;

  if (promoCode) {
    try {
      const r = await resolvePromo(promoCode, subtotalCents, userId ?? undefined);
      discountCents = r.discountKes;
      if (r.deliveryFree) deliveryCents = 0;
      promoId = r.promo.id;
    } catch (promoErr) {
      // Referral codes are real promotion rows now (created alongside each
      // customer's loyalty account), so resolvePromo finds them natively — the
      // special-case fallback that used to live here is gone.
      reportError(promoErr, {
        route: route ?? "computeOrderTotals",
        tags: { stage: "promo_resolution" },
      });
      /* invalid or expired — discount stays 0 */
    }
  }

  const grossCents = discountAppliesToDelivery
    ? Math.max(0, subtotalCents + deliveryCents - discountCents)
    : Math.max(0, subtotalCents - discountCents) + deliveryCents;

  let pointsRedeemed = 0;
  let pointsDiscountCents = 0;

  if (pointsRequested > 0) {
    if (!userId) throw Err.validation("Sign in to spend your Fechi points");

    const { available } = await getBalance(userId);
    if (pointsRequested > available) {
      throw Err.validation(
        `You have ${available.toLocaleString()} points available, but tried to spend ${pointsRequested.toLocaleString()}`,
      );
    }
    ({ pointsRedeemed, pointsDiscountCents } = applyPoints(grossCents, pointsRequested, available));
  }

  return {
    subtotalCents,
    deliveryCents,
    discountCents,
    promoCode,
    promoId,
    pointsRedeemed,
    pointsDiscountCents,
    totalCents: Math.max(0, grossCents - pointsDiscountCents),
  };
}
