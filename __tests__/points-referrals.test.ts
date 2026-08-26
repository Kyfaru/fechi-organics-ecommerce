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
  lifetimeSpendCents: {} as Record<string, number>,
  riskScore: 0,
  unlockResult: { unlockedPoints: 0, voided: false, score: 0 },
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

const unlockJoiningBonus = vi.fn(async (..._args: unknown[]) => state.unlockResult);
const collectOrderSignals = vi.fn(async (..._args: unknown[]) => {});
const assessRisk = vi.fn(async (..._args: unknown[]) => ({ score: state.riskScore, reasons: [] as never[] }));

vi.mock("@/lib/points/ledger", () => ({
  awardPoints: (a: never) => awardPoints(a),
  ensureLoyaltyAccount: async () => ({}),
}));
vi.mock("@/lib/points/stats", () => ({
  getUserStats: async (userId: string) => ({
    userId,
    lifetimeSpendCents: state.lifetimeSpendCents[userId] ?? 0,
    largestOrderCents: 0,
  }),
}));
vi.mock("@/lib/points/anti-abuse", () => ({
  unlockJoiningBonus: (...a: unknown[]) => unlockJoiningBonus(...a),
  collectOrderSignals: (...a: unknown[]) => collectOrderSignals(...a),
  assessRisk: (...a: unknown[]) => assessRisk(...a),
  VOID_AT: 100,
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

const { attachReferral, grantJoiningBonus, processReferralActivation } = await import(
  "@/lib/points/referrals"
);

beforeEach(() => {
  state.loyalty = [{ userId: "alice", referralCode: "REF-ALICE" }];
  state.referrals = [];
  state.paidOrders = {};
  state.awards = [];
  state.lifetimeSpendCents = {};
  state.riskScore = 0;
  state.unlockResult = { unlockedPoints: 0, voided: false, score: 0 };
  awardPoints.mockClear();
  unlockJoiningBonus.mockClear();
  collectOrderSignals.mockClear();
  assessRisk.mockClear();
});

describe("grantJoiningBonus", () => {
  it("locks 100 points when nobody referred them", async () => {
    await grantJoiningBonus({ userId: "bob" });
    expect(state.awards).toEqual([
      { userId: "bob", delta: 0, lockedDelta: 100, reason: "SIGNUP_BONUS" },
    ]);
  });

  it("locks nothing for a user who was referred", async () => {
    await grantJoiningBonus({ userId: "bob", referralCode: "REF-ALICE" });
    expect(state.referrals).toHaveLength(1);
    expect(state.awards).toHaveLength(0);
  });

  it("stays safe to call again after a referral already attached (no wrongful self-lock)", async () => {
    await grantJoiningBonus({ userId: "bob", referralCode: "REF-ALICE" });
    state.awards = [];
    // Replay — e.g. the signup hook firing twice.
    await grantJoiningBonus({ userId: "bob", referralCode: "REF-ALICE" });
    expect(state.awards).toHaveLength(0);
  });
});

describe("attachReferral", () => {
  it("links the pair without awarding any points", async () => {
    const r = await attachReferral({ userId: "bob", code: "ref-alice" });
    expect(r).toEqual({ attached: true });
    expect(state.referrals[0]).toMatchObject({ referrerUserId: "alice", referredUserId: "bob" });
    expect(state.awards).toHaveLength(0);
  });

  it("rejects an unknown code", async () => {
    expect(await attachReferral({ userId: "bob", code: "NOPE" })).toEqual({
      attached: false,
      reason: "UNKNOWN_CODE",
    });
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

describe("processReferralActivation", () => {
  it("does nothing before the referred customer reaches KSh 3,000", async () => {
    await attachReferral({ userId: "bob", code: "REF-ALICE" });
    state.lifetimeSpendCents["bob"] = 100_000; // KSh 1,000

    const out = await processReferralActivation({ userId: "bob", orderId: "order-1", refType: "order" });
    expect(out.referralResolved).toBe(false);
    expect(out.selfUnlocked).toBe(false);
    expect(state.awards).toHaveLength(0);
    expect(state.referrals[0].convertedAt).toBeNull();
  });

  it("pays the referrer 100 once the referred customer crosses KSh 3,000", async () => {
    await attachReferral({ userId: "bob", code: "REF-ALICE" });
    state.lifetimeSpendCents["bob"] = 300_000; // KSh 3,000

    const out = await processReferralActivation({ userId: "bob", orderId: "order-1", refType: "order" });
    expect(out).toMatchObject({ referralResolved: true, referrerUserId: "alice", referrerPoints: 100 });
    expect(state.awards).toEqual([
      { userId: "alice", delta: 100, lockedDelta: 0, reason: "REFERRAL_REWARD" },
    ]);
    expect(state.referrals[0].convertedAt).not.toBeNull();
    expect(collectOrderSignals).toHaveBeenCalledTimes(1);
  });

  it("does not pay again on a later order once already converted", async () => {
    await attachReferral({ userId: "bob", code: "REF-ALICE" });
    state.lifetimeSpendCents["bob"] = 300_000;
    await processReferralActivation({ userId: "bob", orderId: "order-1", refType: "order" });
    state.awards = [];

    const out = await processReferralActivation({ userId: "bob", orderId: "order-2", refType: "order" });
    expect(out.referralResolved).toBe(false);
    expect(state.awards).toHaveLength(0);
  });

  it("voids the referral reward when the referred account looks fraudulent", async () => {
    await attachReferral({ userId: "bob", code: "REF-ALICE" });
    state.lifetimeSpendCents["bob"] = 300_000;
    state.riskScore = 100; // >= VOID_AT

    const out = await processReferralActivation({ userId: "bob", orderId: "order-1", refType: "order" });
    expect(out).toMatchObject({ referralResolved: true, referrerPoints: 0 });
    expect(state.awards).toHaveLength(0);
    expect(state.referrals[0].convertedAt).not.toBeNull();
    expect(state.referrals[0].rewardedAt).toBeNull();
  });

  it("converts but pays nothing once the referrer is past their five", async () => {
    await attachReferral({ userId: "bob", code: "REF-ALICE" });
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
    state.lifetimeSpendCents["bob"] = 300_000;

    const out = await processReferralActivation({ userId: "bob", orderId: "order-1", refType: "order" });
    expect(out).toMatchObject({ referralResolved: true, referrerPoints: 0 });
    expect(state.awards).toHaveLength(0);
  });

  it("unlocks the customer's own bonus when nobody referred them", async () => {
    state.lifetimeSpendCents["dave"] = 300_000;
    state.unlockResult = { unlockedPoints: 100, voided: false, score: 0 };

    const out = await processReferralActivation({ userId: "dave", orderId: "order-9", refType: "order" });
    expect(out).toMatchObject({ referralResolved: false, selfUnlocked: true, selfUnlockedPoints: 100 });
    expect(unlockJoiningBonus).toHaveBeenCalledWith({ userId: "dave", orderId: "order-9", refType: "order" });
  });
});
