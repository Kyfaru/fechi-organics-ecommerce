import { describe, it, expect, vi, beforeEach } from "vitest";

const resolvePromo = vi.fn();
const getBalance = vi.fn();

vi.mock("@/lib/promo", () => ({ resolvePromo: (...a: unknown[]) => resolvePromo(...a) }));
vi.mock("@/lib/observability", () => ({ reportError: () => {} }));
vi.mock("@/lib/points/ledger", () => ({
  getBalance: (...a: unknown[]) => getBalance(...a),
  CENTS_PER_POINT: 40,
}));

const { computeOrderTotals, applyPoints } = await import("@/lib/checkout/compute-totals");

const KES = 100;
const USER = "user-1";

beforeEach(() => {
  resolvePromo.mockReset();
  getBalance.mockReset();
  getBalance.mockResolvedValue({ available: 0, locked: 0, lifetimeEarned: 0, lifetimeRedeemed: 0 });
});

describe("applyPoints", () => {
  it("values points at KSh 0.40 each", () => {
    expect(applyPoints(10_000 * KES, 1_000, 5_000)).toEqual({
      pointsRedeemed: 1_000,
      pointsDiscountCents: 400 * KES,
    });
  });

  it("caps at the balance the customer actually has", () => {
    expect(applyPoints(10_000 * KES, 5_000, 900).pointsRedeemed).toBe(900);
  });

  it("never discounts more than the bill", () => {
    const r = applyPoints(100 * KES, 10_000, 10_000);
    expect(r.pointsDiscountCents).toBe(100 * KES);
  });

  it("can zero a bill that is not a whole multiple of 40 cents", () => {
    const gross = 1_007; // KSh 10.07
    const r = applyPoints(gross, 999_999, 999_999);
    expect(r.pointsDiscountCents).toBe(gross);
    expect(gross - r.pointsDiscountCents).toBe(0);
  });

  it("is a no-op on a zero bill or empty balance", () => {
    expect(applyPoints(0, 100, 100).pointsRedeemed).toBe(0);
    expect(applyPoints(1_000, 100, 0).pointsRedeemed).toBe(0);
    expect(applyPoints(1_000, 0, 100).pointsRedeemed).toBe(0);
  });
});

describe("computeOrderTotals", () => {
  it("computes a plain order with no coupon and no points", async () => {
    const t = await computeOrderTotals({ subtotalCents: 5_000 * KES, deliveryCents: 350 * KES });
    expect(t.totalCents).toBe(5_350 * KES);
    expect(t.pointsRedeemed).toBe(0);
    expect(t.promoId).toBeNull();
  });

  it("stacks points on top of a coupon, coupon first", async () => {
    // KSh 10,000 subtotal, 10% off, then 1,000 points (KSh 400) off that.
    resolvePromo.mockResolvedValue({
      promo: { id: "promo-1", type: "PERCENTAGE", value: 10 },
      discountKes: 1_000 * KES,
      deliveryFree: false,
    });
    getBalance.mockResolvedValue({ available: 5_000, locked: 0, lifetimeEarned: 0, lifetimeRedeemed: 0 });

    const t = await computeOrderTotals({
      subtotalCents: 10_000 * KES,
      deliveryCents: 350 * KES,
      promoCode: "save10",
      pointsRequested: 1_000,
      userId: USER,
    });

    expect(t.discountCents).toBe(1_000 * KES);
    expect(t.pointsRedeemed).toBe(1_000);
    expect(t.pointsDiscountCents).toBe(400 * KES);
    // 10,000 + 350 − 1,000 − 400
    expect(t.totalCents).toBe(8_950 * KES);
  });

  it("uppercases and trims the promo code before lookup", async () => {
    resolvePromo.mockResolvedValue({ promo: { id: "p" }, discountKes: 0, deliveryFree: false });
    const t = await computeOrderTotals({
      subtotalCents: 1_000 * KES,
      deliveryCents: 0,
      promoCode: "  save10  ",
    });
    expect(resolvePromo).toHaveBeenCalledWith("SAVE10", 1_000 * KES, undefined);
    expect(t.promoCode).toBe("SAVE10");
  });

  it("swallows an invalid coupon rather than failing the checkout", async () => {
    resolvePromo.mockRejectedValue(new Error("Invalid or expired coupon code"));
    const t = await computeOrderTotals({
      subtotalCents: 5_000 * KES,
      deliveryCents: 350 * KES,
      promoCode: "EXPIRED",
    });
    expect(t.discountCents).toBe(0);
    expect(t.totalCents).toBe(5_350 * KES);
  });

  it("zeroes delivery for a free-shipping coupon", async () => {
    resolvePromo.mockResolvedValue({ promo: { id: "p" }, discountKes: 0, deliveryFree: true });
    const t = await computeOrderTotals({
      subtotalCents: 5_000 * KES,
      deliveryCents: 350 * KES,
      promoCode: "FREESHIP",
    });
    expect(t.deliveryCents).toBe(0);
    expect(t.totalCents).toBe(5_000 * KES);
  });

  it("rejects spending more points than the customer holds", async () => {
    getBalance.mockResolvedValue({ available: 500, locked: 4_000, lifetimeEarned: 0, lifetimeRedeemed: 0 });
    await expect(
      computeOrderTotals({
        subtotalCents: 5_000 * KES,
        deliveryCents: 0,
        pointsRequested: 2_000,
        userId: USER,
      }),
    ).rejects.toBeInstanceOf(Response);
  });

  it("does not let locked points be spent", async () => {
    // 4,000 signup points are locked until the first paid order.
    getBalance.mockResolvedValue({ available: 0, locked: 4_000, lifetimeEarned: 0, lifetimeRedeemed: 0 });
    await expect(
      computeOrderTotals({ subtotalCents: 5_000 * KES, deliveryCents: 0, pointsRequested: 1, userId: USER }),
    ).rejects.toBeInstanceOf(Response);
  });

  it("refuses points for a signed-out caller", async () => {
    await expect(
      computeOrderTotals({ subtotalCents: 5_000 * KES, deliveryCents: 0, pointsRequested: 100 }),
    ).rejects.toBeInstanceOf(Response);
  });

  it("supports paying an order entirely with points", async () => {
    getBalance.mockResolvedValue({ available: 100_000, locked: 0, lifetimeEarned: 0, lifetimeRedeemed: 0 });
    const t = await computeOrderTotals({
      subtotalCents: 5_000 * KES,
      deliveryCents: 350 * KES,
      pointsRequested: 100_000,
      userId: USER,
    });
    expect(t.totalCents).toBe(0);
    // Only what was needed is spent, not the whole balance.
    expect(t.pointsRedeemed).toBe(Math.ceil((5_350 * KES) / 40));
  });

  it("never returns a negative total", async () => {
    resolvePromo.mockResolvedValue({
      promo: { id: "p" },
      discountKes: 999_999 * KES,
      deliveryFree: false,
    });
    const t = await computeOrderTotals({
      subtotalCents: 1_000 * KES,
      deliveryCents: 350 * KES,
      promoCode: "HUGE",
    });
    expect(t.totalCents).toBe(0);
  });

  it("keeps delivery payable in-store, where a coupon may not eat it", async () => {
    resolvePromo.mockResolvedValue({
      promo: { id: "p" },
      discountKes: 5_000 * KES,
      deliveryFree: false,
    });
    const online = await computeOrderTotals({
      subtotalCents: 1_000 * KES,
      deliveryCents: 350 * KES,
      promoCode: "BIG",
    });
    const inStore = await computeOrderTotals({
      subtotalCents: 1_000 * KES,
      deliveryCents: 350 * KES,
      promoCode: "BIG",
      discountAppliesToDelivery: false,
    });
    expect(online.totalCents).toBe(0);
    expect(inStore.totalCents).toBe(350 * KES);
  });
});
