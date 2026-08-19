import { describe, it, expect, vi, beforeEach } from "vitest";

type Referral = {
  id: string;
  referrerUserId: string;
  referredUserId: string;
  code: string;
  convertedAt: Date | null;
  rewardedAt: Date | null;
};

const state = {
  loyalty: [] as Array<{ userId: string; referralCode: string }>,
  referrals: [] as Referral[],
  paidOrders: {} as Record<string, number>,
  awards: [] as Array<{ userId: string; delta: number; lockedDelta: number; reason: string }>,
};

const awardPoints = vi.fn(
  async (a: { userId: string; delta?: number; lockedDelta?: number; reason: string }) => {
    state.awards.push({
      userId: a.userId,
      delta: a.delta ?? 0,
      lockedDelta: a.lockedDelta ?? 0,
      reason: a.reason,
    });
    return { id: `e${state.awards.length}` };
  },
);

vi.mock("@/lib/points/ledger", () => ({
  awardPoints: (a: never) => awardPoints(a),
  ensureLoyaltyAccount: async () => ({}),
}));
vi.mock("@/lib/sms", () => ({ sendSms: vi.fn(), hasSmsConfig: () => false }));
vi.mock("@/lib/phone", () => ({ combineLegacyPhone: () => null }));
vi.mock("@/lib/db", () => ({
  db: {
    loyaltyPoints: {
      findUnique: async ({ where }: { where: { referralCode?: string } }) =>
        state.loyalty.find((l) => l.referralCode === where.referralCode) ?? null,
    },
    referral: {
      findUnique: async ({ where }: { where: { referredUserId: string } }) =>
        state.referrals.find((r) => r.referredUserId === where.referredUserId) ?? null,
      count: async ({ where }: { where: { referrerUserId: string; rewardedAt?: unknown } }) =>
        state.referrals.filter((r) => r.referrerUserId === where.referrerUserId && r.rewardedAt).length,
      create: async ({ data }: { data: Omit<Referral, "id" | "convertedAt" | "rewardedAt"> }) => {
        if (state.referrals.some((r) => r.referredUserId === data.referredUserId)) {
          throw new Error("unique violation");
        }
        const r: Referral = {
          ...data,
          id: `ref${state.referrals.length + 1}`,
          convertedAt: null,
          rewardedAt: null,
        };
        state.referrals.push(r);
        return r;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Referral> }) => {
        const r = state.referrals.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      },
    },
    order: {
      count: async ({ where }: { where: { userId: string } }) => state.paidOrders[where.userId] ?? 0,
    },
    inboxMessage: { create: async () => ({}) },
    user: { findUnique: async () => null },
  },
}));

const { attachReferral, convertReferral, grantJoiningBonus } = await import("@/lib/points/referrals");

beforeEach(() => {
  state.loyalty = [{ userId: "alice", referralCode: "REF-ALICE" }];
  state.referrals = [];
  state.paidOrders = {};
  state.awards = [];
  awardPoints.mockClear();
});

describe("grantJoiningBonus", () => {
  it("credits 4,000 points LOCKED, not spendable", async () => {
    await grantJoiningBonus({ userId: "bob" });
    expect(state.awards).toEqual([
      { userId: "bob", delta: 0, lockedDelta: 4_000, reason: "SIGNUP_BONUS" },
    ]);
  });
});

describe("attachReferral", () => {
  it("links the pair and locks a 500-point welcome bonus", async () => {
    const r = await attachReferral({ userId: "bob", code: "ref-alice" });
    expect(r).toEqual({ attached: true, bonusPoints: 500 });
    expect(state.referrals[0]).toMatchObject({ referrerUserId: "alice", referredUserId: "bob" });
    expect(state.awards).toEqual([
      { userId: "bob", delta: 0, lockedDelta: 500, reason: "REFERRED_BONUS" },
    ]);
  });

  it("rejects an unknown code", async () => {
    expect(await attachReferral({ userId: "bob", code: "NOPE" })).toEqual({
      attached: false,
      reason: "UNKNOWN_CODE",
    });
    expect(state.awards).toHaveLength(0);
  });

  it("rejects self-referral", async () => {
    expect(await attachReferral({ userId: "alice", code: "REF-ALICE" })).toEqual({
      attached: false,
      reason: "SELF_REFERRAL",
    });
  });

  it("allows only one referrer per person, ever", async () => {
    await attachReferral({ userId: "bob", code: "REF-ALICE" });
    state.loyalty.push({ userId: "carol", referralCode: "REF-CAROL" });
    expect(await attachReferral({ userId: "bob", code: "REF-CAROL" })).toEqual({
      attached: false,
      reason: "ALREADY_REFERRED",
    });
    expect(state.awards).toHaveLength(1);
  });

  it("refuses a customer who has already paid for an order", async () => {
    state.paidOrders["bob"] = 1;
    expect(await attachReferral({ userId: "bob", code: "REF-ALICE" })).toEqual({
      attached: false,
      reason: "NOT_NEW",
    });
  });

  it("stops at five rewarded referrals per referrer", async () => {
    for (let i = 0; i < 5; i++) {
      state.referrals.push({
        id: `r${i}`,
        referrerUserId: "alice",
        referredUserId: `u${i}`,
        code: "REF-ALICE",
        convertedAt: new Date(),
        rewardedAt: new Date(),
      });
    }
    expect(await attachReferral({ userId: "bob", code: "REF-ALICE" })).toEqual({
      attached: false,
      reason: "CAP_REACHED",
    });
  });
});

describe("convertReferral", () => {
  it("pays the referrer 1,000 on the referred customer's first paid order", async () => {
    await attachReferral({ userId: "bob", code: "REF-ALICE" });
    state.awards = [];

    const out = await convertReferral({ userId: "bob", orderId: "order-1" });
    expect(out).toMatchObject({ converted: true, referrerUserId: "alice", referrerPoints: 1_000 });
    expect(state.awards).toEqual([
      { userId: "alice", delta: 1_000, lockedDelta: 0, reason: "REFERRAL_REWARD" },
    ]);
    expect(state.referrals[0].convertedAt).not.toBeNull();
  });

  it("does not pay again on the second order", async () => {
    await attachReferral({ userId: "bob", code: "REF-ALICE" });
    await convertReferral({ userId: "bob", orderId: "order-1" });
    state.awards = [];

    expect(await convertReferral({ userId: "bob", orderId: "order-2" })).toMatchObject({
      converted: false,
    });
    expect(state.awards).toHaveLength(0);
  });

  it("is a no-op for a customer nobody referred", async () => {
    expect(await convertReferral({ userId: "dave", orderId: "order-9" })).toMatchObject({
      converted: false,
      referrerUserId: null,
    });
  });

  it("converts but pays nothing once the referrer is past their five", async () => {
    await attachReferral({ userId: "bob", code: "REF-ALICE" });
    // Five other referrals reach reward status before Bob's order lands.
    for (let i = 0; i < 5; i++) {
      state.referrals.push({
        id: `x${i}`,
        referrerUserId: "alice",
        referredUserId: `u${i}`,
        code: "REF-ALICE",
        convertedAt: new Date(),
        rewardedAt: new Date(),
      });
    }
    state.awards = [];

    const out = await convertReferral({ userId: "bob", orderId: "order-1" });
    expect(out).toMatchObject({ converted: true, referrerPoints: 0 });
    expect(state.awards).toHaveLength(0);
  });
});
