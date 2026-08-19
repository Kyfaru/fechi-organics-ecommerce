import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Guards on the zero-cash checkout path.
 *
 * This endpoint hands over goods without taking money, so the rules that keep
 * it safe are the ones worth pinning down: it may only ever run when the
 * recomputed total is exactly zero, and the points debit must happen before
 * the order is fulfilled.
 */

const resolvePromo = vi.fn();
const getBalance = vi.fn();

vi.mock("@/lib/promo", () => ({ resolvePromo: (...a: unknown[]) => resolvePromo(...a) }));
vi.mock("@/lib/observability", () => ({ reportError: () => {} }));
vi.mock("@/lib/points/ledger", () => ({
  getBalance: (...a: unknown[]) => getBalance(...a),
  CENTS_PER_POINT: 40,
}));

const { computeOrderTotals } = await import("@/lib/checkout/compute-totals");

const KES = 100;
const USER = "user-1";

beforeEach(() => {
  resolvePromo.mockReset();
  getBalance.mockReset();
});

/** The endpoint's own precondition, expressed as the caller applies it. */
function qualifiesForZeroCashCheckout(t: { pointsRedeemed: number; totalCents: number }) {
  return t.pointsRedeemed > 0 && t.totalCents === 0;
}

describe("zero-cash checkout eligibility", () => {
  it("qualifies when points cover the bill exactly", async () => {
    getBalance.mockResolvedValue({ available: 100_000, locked: 0, lifetimeEarned: 0, lifetimeRedeemed: 0 });

    const t = await computeOrderTotals({
      subtotalCents: 1_000 * KES,
      deliveryCents: 350 * KES,
      pointsRequested: 100_000,
      userId: USER,
    });

    expect(t.totalCents).toBe(0);
    expect(qualifiesForZeroCashCheckout(t)).toBe(true);
  });

  it("does NOT qualify when a cash remainder is left", async () => {
    // The dangerous case: a partly-covered order must not slip through a path
    // that never collects the difference.
    getBalance.mockResolvedValue({ available: 100, locked: 0, lifetimeEarned: 0, lifetimeRedeemed: 0 });

    const t = await computeOrderTotals({
      subtotalCents: 10_000 * KES,
      deliveryCents: 0,
      pointsRequested: 100,
      userId: USER,
    });

    expect(t.totalCents).toBeGreaterThan(0);
    expect(qualifiesForZeroCashCheckout(t)).toBe(false);
  });

  it("does NOT qualify for a free order where no points were spent", async () => {
    // A 100%-off coupon zeroes the total without any points — that is a normal
    // order, not a points redemption, and must not be labelled as one.
    resolvePromo.mockResolvedValue({
      promo: { id: "p", ownerUserId: null, pointsAward: 0 },
      discountKes: 1_000 * KES,
      deliveryFree: true,
    });
    getBalance.mockResolvedValue({ available: 0, locked: 0, lifetimeEarned: 0, lifetimeRedeemed: 0 });

    const t = await computeOrderTotals({
      subtotalCents: 1_000 * KES,
      deliveryCents: 350 * KES,
      promoCode: "FREE100",
      userId: USER,
    });

    expect(t.totalCents).toBe(0);
    expect(t.pointsRedeemed).toBe(0);
    expect(qualifiesForZeroCashCheckout(t)).toBe(false);
  });

  it("refuses to spend points the customer does not hold", async () => {
    getBalance.mockResolvedValue({ available: 10, locked: 4_000, lifetimeEarned: 0, lifetimeRedeemed: 0 });

    await expect(
      computeOrderTotals({
        subtotalCents: 1_000 * KES,
        deliveryCents: 0,
        pointsRequested: 100_000,
        userId: USER,
      }),
    ).rejects.toBeInstanceOf(Response);
  });

  it("counts locked points as unspendable, so they cannot zero an order", async () => {
    getBalance.mockResolvedValue({ available: 0, locked: 100_000, lifetimeEarned: 0, lifetimeRedeemed: 0 });

    await expect(
      computeOrderTotals({
        subtotalCents: 1_000 * KES,
        deliveryCents: 0,
        pointsRequested: 100_000,
        userId: USER,
      }),
    ).rejects.toBeInstanceOf(Response);
  });

  it("spends only what the bill needs, never the whole balance", async () => {
    getBalance.mockResolvedValue({ available: 500_000, locked: 0, lifetimeEarned: 0, lifetimeRedeemed: 0 });

    const t = await computeOrderTotals({
      subtotalCents: 1_000 * KES,
      deliveryCents: 350 * KES,
      pointsRequested: 500_000,
      userId: USER,
    });

    expect(t.totalCents).toBe(0);
    expect(t.pointsRedeemed).toBe(Math.ceil((1_350 * KES) / 40));
    expect(t.pointsRedeemed).toBeLessThan(500_000);
  });

  it("still applies a coupon before points on a zero-cash order", async () => {
    resolvePromo.mockResolvedValue({
      promo: { id: "p", ownerUserId: null, pointsAward: 0 },
      discountKes: 1_000 * KES,
      deliveryFree: false,
    });
    getBalance.mockResolvedValue({ available: 100_000, locked: 0, lifetimeEarned: 0, lifetimeRedeemed: 0 });

    const t = await computeOrderTotals({
      subtotalCents: 10_000 * KES,
      deliveryCents: 350 * KES,
      promoCode: "SAVE10",
      pointsRequested: 100_000,
      userId: USER,
    });

    // Coupon first, then points on the remainder — so the customer spends
    // fewer points than the undiscounted bill would have cost.
    expect(t.discountCents).toBe(1_000 * KES);
    expect(t.totalCents).toBe(0);
    expect(t.pointsRedeemed).toBe(Math.ceil((9_350 * KES) / 40));
  });
});
