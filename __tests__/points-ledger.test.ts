import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.POINTS_LEDGER_SECRET = "test-secret-do-not-use-in-production";

const findMany = vi.fn();
const loyaltyFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    pointsLedger: { findMany: (...a: unknown[]) => findMany(...a) },
    loyaltyPoints: { findUnique: (...a: unknown[]) => loyaltyFindUnique(...a) },
  },
}));

const { verifyChain, entryHash, pointsToCents, centsToPoints, CENTS_PER_POINT } = await import(
  "@/lib/points/ledger"
);

const GENESIS = "0".repeat(64);
const USER = "user-1";

type Row = {
  userId: string;
  seq: number;
  delta: number;
  lockedDelta: number;
  balanceAfter: number;
  lockedAfter: number;
  reason: string;
  refType: string | null;
  refId: string | null;
  createdAt: Date;
  prevHash: string;
  hash: string;
};

/** Builds a valid, correctly-chained ledger from a list of movements. */
function buildChain(moves: Array<{ delta?: number; lockedDelta?: number; reason?: string; refId?: string }>): Row[] {
  const rows: Row[] = [];
  let prevHash = GENESIS;
  let balance = 0;
  let locked = 0;

  moves.forEach((m, i) => {
    const delta = m.delta ?? 0;
    const lockedDelta = m.lockedDelta ?? 0;
    balance += delta;
    locked += lockedDelta;
    const partial = {
      prevHash,
      userId: USER,
      seq: i + 1,
      delta,
      lockedDelta,
      balanceAfter: balance,
      lockedAfter: locked,
      reason: (m.reason ?? "ORDER_BASE") as never,
      refType: "order" as string | null,
      refId: (m.refId ?? `order-${i}`) as string | null,
      createdAt: new Date(1_700_000_000_000 + i * 1000),
    };
    const hash = entryHash(partial);
    rows.push({ ...partial, hash });
    prevHash = hash;
  });

  return rows;
}

beforeEach(() => {
  findMany.mockReset();
  loyaltyFindUnique.mockReset();
});

function withChain(rows: Row[], cache?: { points: number; lockedPoints: number }) {
  findMany.mockResolvedValue(rows);
  const last = rows[rows.length - 1];
  loyaltyFindUnique.mockResolvedValue(
    cache ?? { points: last?.balanceAfter ?? 0, lockedPoints: last?.lockedAfter ?? 0 },
  );
}

describe("POINTS_LEDGER_SECRET", () => {
  // Regression guard. This exact gap silently broke every award on staging:
  // the key was in neither .env.local nor .env.example, so entryHash() threw on
  // every call, every call site caught it (a loyalty failure must never block a
  // signup or a payment), and the only symptom was customers not earning points.
  it("refuses to sign an entry in production when unset", () => {
    const prevSecret = process.env.POINTS_LEDGER_SECRET;
    const prevEnv = process.env.NODE_ENV;
    try {
      delete process.env.POINTS_LEDGER_SECRET;
      // vi.stubEnv, not defineProperty — Vitest guards process.env with a proxy
      // that rejects non-enumerable descriptors.
      vi.stubEnv("NODE_ENV", "production");

      expect(() =>
        entryHash({
          prevHash: GENESIS,
          userId: USER,
          seq: 1,
          delta: 100,
          lockedDelta: 0,
          balanceAfter: 100,
          lockedAfter: 0,
          reason: "ORDER_BASE" as never,
          refType: "order",
          refId: "o1",
          createdAt: new Date(0),
        }),
      ).toThrow(/POINTS_LEDGER_SECRET/);
    } finally {
      if (prevSecret !== undefined) process.env.POINTS_LEDGER_SECRET = prevSecret;
      vi.stubEnv("NODE_ENV", prevEnv ?? "test");
      vi.unstubAllEnvs();
    }
  });
});

describe("point/cash conversion", () => {
  it("values a point at KSh 0.40", () => {
    expect(CENTS_PER_POINT).toBe(40);
    expect(pointsToCents(1_000)).toBe(40_000); // KSh 400.00
  });

  it("rounds up when converting cash to points so cash owed never goes negative", () => {
    expect(centsToPoints(41)).toBe(2);
    expect(centsToPoints(80)).toBe(2);
  });
});

describe("verifyChain", () => {
  it("accepts an untouched chain", async () => {
    withChain(buildChain([{ delta: 700 }, { delta: 1_000 }, { delta: -500, reason: "REDEEM" }]));
    const res = await verifyChain(USER);
    expect(res).toMatchObject({ ok: true, entries: 3, computedBalance: 1_200 });
  });

  it("accepts an empty ledger", async () => {
    withChain([]);
    expect(await verifyChain(USER)).toMatchObject({ ok: true, entries: 0 });
  });

  it("detects an edited amount", async () => {
    const rows = buildChain([{ delta: 700 }, { delta: 200 }, { delta: 200 }]);
    // Somebody hand-edits the middle row's payout upward and fixes the running total.
    rows[1].delta = 20_000;
    rows[1].balanceAfter = 20_700;
    rows[2].balanceAfter = 20_900;
    withChain(rows, { points: 20_900, lockedPoints: 0 });

    const res = await verifyChain(USER);
    expect(res.ok).toBe(false);
    expect(res.brokenAtSeq).toBe(2);
    expect(res.reason).toBe("HASH_MISMATCH");
  });

  it("detects an edited amount even when the row's own hash is recomputed", async () => {
    const rows = buildChain([{ delta: 700 }, { delta: 200 }, { delta: 200 }]);
    rows[1].delta = 20_000;
    rows[1].balanceAfter = 20_700;
    // An attacker with the table but not POINTS_LEDGER_SECRET cannot produce this,
    // but even given a forged hash the *next* row's prevHash still points at the old one.
    rows[1].hash = "f".repeat(64);
    withChain(rows, { points: 20_900, lockedPoints: 0 });

    const res = await verifyChain(USER);
    expect(res.ok).toBe(false);
    expect(res.brokenAtSeq).toBe(2);
  });

  it("detects a deleted row", async () => {
    const rows = buildChain([{ delta: 700 }, { delta: -700, reason: "REDEEM" }, { delta: 300 }]);
    // Delete the redemption so the balance looks untouched.
    const tampered = [rows[0], rows[2]];
    withChain(tampered, { points: 1_000, lockedPoints: 0 });

    const res = await verifyChain(USER);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("SEQUENCE_GAP");
  });

  it("detects reordered rows", async () => {
    const rows = buildChain([{ delta: 700 }, { delta: 200 }, { delta: 300 }]);
    withChain([rows[0], rows[2], rows[1]]);

    const res = await verifyChain(USER);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("SEQUENCE_GAP");
  });

  it("detects a cache row inflated behind the ledger's back", async () => {
    const rows = buildChain([{ delta: 700 }]);
    withChain(rows, { points: 9_999_999, lockedPoints: 0 });

    const res = await verifyChain(USER);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("CACHE_MISMATCH");
    expect(res.computedBalance).toBe(700);
    expect(res.cachedBalance).toBe(9_999_999);
  });

  it("tracks the locked pot separately through lock, unlock and spend", async () => {
    withChain(
      buildChain([
        { lockedDelta: 4_000, reason: "SIGNUP_BONUS", refId: "signup" },
        { delta: 4_000, lockedDelta: -4_000, reason: "SIGNUP_BONUS", refId: "unlock" },
        { delta: -1_500, reason: "REDEEM", refId: "order-x" },
      ]),
    );
    const res = await verifyChain(USER);
    expect(res).toMatchObject({ ok: true, computedBalance: 2_500 });
  });
});

describe("entryHash", () => {
  const fields = {
    prevHash: GENESIS,
    userId: USER,
    seq: 1,
    delta: 100,
    lockedDelta: 0,
    balanceAfter: 100,
    lockedAfter: 0,
    reason: "ORDER_BASE" as never,
    refType: "order",
    refId: "o1",
    createdAt: new Date(1_700_000_000_000),
  };

  it("is deterministic", () => {
    expect(entryHash(fields)).toBe(entryHash(fields));
  });

  it("changes when any covered field changes", () => {
    const baseline = entryHash(fields);
    const mutations = [
      { delta: 101 },
      { lockedDelta: 1 },
      { balanceAfter: 101 },
      { lockedAfter: 1 },
      { seq: 2 },
      { userId: "user-2" },
      { reason: "SUPER_ADMIN_GRANT" as never },
      { refId: "o2" },
      { refType: "grant" },
      { prevHash: "a".repeat(64) },
      { createdAt: new Date(1_700_000_001_000) },
    ];
    for (const m of mutations) {
      expect(entryHash({ ...fields, ...m }), JSON.stringify(m)).not.toBe(baseline);
    }
  });
});
