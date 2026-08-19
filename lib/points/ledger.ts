/**
 * The only write path for loyalty points.
 *
 * pointsLedger is append-only and HMAC hash-chained: every entry carries the
 * previous entry's hash, so editing, deleting or reordering any row breaks the
 * chain from that point on and verifyChain() reports exactly where. The secret
 * lives in the environment, not the database, so database access alone cannot
 * forge a valid entry. The database also refuses UPDATE/DELETE outright — see
 * prisma/sql/points-ledger-guard.sql.
 *
 * Corrections are compensating entries, never edits.
 *
 * loyaltyPoints is a read cache over this chain, and its row doubles as the
 * per-user lock (SELECT ... FOR UPDATE) that serializes appends so `seq` and
 * `prevHash` cannot race.
 */

import { createHmac, randomBytes } from "crypto";
import type { PointsReason, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { TxClient } from "@/lib/orders/generate-order-number";

/** Genesis link for a user's first entry. */
const GENESIS = "0".repeat(64);

/** 1 point = KSh 0.40 = 40 cents. Money is integer cents repo-wide. */
export const CENTS_PER_POINT = 40;

export function pointsToCents(points: number): number {
  return points * CENTS_PER_POINT;
}

/** Points needed to cover `cents`, rounded up so the cash remainder is never negative. */
export function centsToPoints(cents: number): number {
  return Math.ceil(cents / CENTS_PER_POINT);
}

/**
 * Reasons that are not backed by a real purchase. Their lifetime total is
 * capped (see NON_PURCHASE_POINTS_CAP) so the free-points ceiling is enforced
 * in one place rather than trusted to each caller.
 */
const NON_PURCHASE_REASONS: ReadonlySet<PointsReason> = new Set([
  "SIGNUP_BONUS",
  "REFERRAL_REWARD",
  "REFERRED_BONUS",
] as PointsReason[]);

/** 4,000 signup + 500 referred + 5 x 1,000 referrals. */
export const NON_PURCHASE_POINTS_CAP = 9500;

function secret(): string {
  const s = process.env.POINTS_LEDGER_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[points] POINTS_LEDGER_SECRET is not set");
    }
    return "dev-points-secret-not-for-production";
  }
  return s;
}

type HashInput = {
  prevHash: string;
  userId: string;
  seq: number;
  delta: number;
  lockedDelta: number;
  balanceAfter: number;
  lockedAfter: number;
  reason: PointsReason;
  refType: string | null;
  refId: string | null;
  createdAt: Date;
};

export function entryHash(e: HashInput): string {
  const payload = [
    e.prevHash,
    e.userId,
    e.seq,
    e.delta,
    e.lockedDelta,
    e.balanceAfter,
    e.lockedAfter,
    e.reason,
    e.refType ?? "",
    e.refId ?? "",
    e.createdAt.toISOString(),
  ].join("|");
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/** Ambiguity-free code alphabet — no O/0/I/1. Used for userCode and referralCode. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(prefix: string, length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `${prefix}-${out}`;
}

/**
 * Returns the user's loyalty row, creating it on first touch. Safe to call
 * concurrently — a lost create race resolves to the winner's row.
 */
export async function ensureLoyaltyAccount(userId: string, client: TxClient | typeof db = db) {
  const existing = await client.loyaltyPoints.findUnique({ where: { userId } });
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await client.loyaltyPoints.create({
        data: { userId, userCode: makeCode("FO"), referralCode: makeCode("REF") },
      });
    } catch {
      // Either a code collided or another request created the row first.
      const now = await client.loyaltyPoints.findUnique({ where: { userId } });
      if (now) return now;
    }
  }
  throw new Error(`[points] could not create loyalty account for ${userId}`);
}

export type AwardArgs = {
  userId: string;
  /** Change to spendable balance. Negative to spend. */
  delta?: number;
  /** Change to the locked (not yet spendable) pot. */
  lockedDelta?: number;
  reason: PointsReason;
  refType?: string | null;
  refId?: string | null;
  meta?: Prisma.InputJsonValue;
  /** Join an existing transaction. Omit and one is opened. */
  tx?: TxClient;
};

export type LedgerEntry = {
  id: string;
  seq: number;
  delta: number;
  lockedDelta: number;
  balanceAfter: number;
  lockedAfter: number;
  hash: string;
};

/** Postgres unique-violation. A replayed callback lands here and is a no-op. */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

async function appendEntry(tx: TxClient, args: AwardArgs): Promise<LedgerEntry | null> {
  const delta = args.delta ?? 0;
  const lockedDelta = args.lockedDelta ?? 0;
  if (delta === 0 && lockedDelta === 0) return null;

  await ensureLoyaltyAccount(args.userId, tx);

  // Serialize every append for this user. Without this two concurrent awards
  // can read the same `seq` and prevHash and produce a forked chain.
  await tx.$queryRaw`SELECT id FROM public."loyaltyPoints" WHERE "userId" = ${args.userId} FOR UPDATE`;

  const last = await tx.pointsLedger.findFirst({
    where: { userId: args.userId },
    orderBy: { seq: "desc" },
    select: { seq: true, hash: true, balanceAfter: true, lockedAfter: true },
  });

  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.hash ?? GENESIS;
  const balanceAfter = (last?.balanceAfter ?? 0) + delta;
  const lockedAfter = (last?.lockedAfter ?? 0) + lockedDelta;

  if (balanceAfter < 0) {
    throw new Error(`[points] refusing to overdraw: user ${args.userId} would reach ${balanceAfter}`);
  }
  if (lockedAfter < 0) {
    throw new Error(`[points] refusing to overdraw locked pot: user ${args.userId} would reach ${lockedAfter}`);
  }

  // Free-points ceiling, enforced once here rather than at each call site.
  if (NON_PURCHASE_REASONS.has(args.reason) && delta + lockedDelta > 0) {
    const priorAgg = await tx.pointsLedger.aggregate({
      where: { userId: args.userId, reason: { in: [...NON_PURCHASE_REASONS] } },
      _sum: { delta: true, lockedDelta: true },
    });
    const prior = (priorAgg._sum.delta ?? 0) + (priorAgg._sum.lockedDelta ?? 0);
    if (prior + delta + lockedDelta > NON_PURCHASE_POINTS_CAP) {
      return null;
    }
  }

  const createdAt = new Date();
  const refType = args.refType ?? null;
  const refId = args.refId ?? null;
  const hash = entryHash({
    prevHash,
    userId: args.userId,
    seq,
    delta,
    lockedDelta,
    balanceAfter,
    lockedAfter,
    reason: args.reason,
    refType,
    refId,
    createdAt,
  });

  const entry = await tx.pointsLedger.create({
    data: {
      userId: args.userId,
      seq,
      delta,
      lockedDelta,
      balanceAfter,
      lockedAfter,
      reason: args.reason,
      refType,
      refId,
      meta: args.meta,
      prevHash,
      hash,
      createdAt,
    },
    select: { id: true, seq: true, delta: true, lockedDelta: true, balanceAfter: true, lockedAfter: true, hash: true },
  });

  await tx.loyaltyPoints.update({
    where: { userId: args.userId },
    data: {
      points: balanceAfter,
      lockedPoints: lockedAfter,
      ...(delta > 0 ? { lifetimeEarned: { increment: delta } } : {}),
      ...(args.reason === "REDEEM" && delta < 0 ? { lifetimeRedeemed: { increment: -delta } } : {}),
    },
  });

  return entry;
}

/**
 * Appends one ledger entry. Returns null when the entry already exists (the
 * (userId, reason, refType, refId) unique constraint caught a replay) or when
 * the free-points cap blocked it — both are success from a caller's point of
 * view, not errors. Throws only on a genuine overdraw or database failure.
 */
export async function awardPoints(args: AwardArgs): Promise<LedgerEntry | null> {
  try {
    if (args.tx) return await appendEntry(args.tx, args);
    return await db.$transaction((tx: TxClient) => appendEntry(tx, args));
  } catch (e) {
    if (isUniqueViolation(e)) return null;
    throw e;
  }
}

export type Balance = {
  available: number;
  locked: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
};

/** Reads the cache row. Use verifyChain() when you need the authoritative sum. */
export async function getBalance(userId: string): Promise<Balance> {
  const row = await db.loyaltyPoints.findUnique({
    where: { userId },
    select: { points: true, lockedPoints: true, lifetimeEarned: true, lifetimeRedeemed: true },
  });
  return {
    available: row?.points ?? 0,
    locked: row?.lockedPoints ?? 0,
    lifetimeEarned: row?.lifetimeEarned ?? 0,
    lifetimeRedeemed: row?.lifetimeRedeemed ?? 0,
  };
}

export type ChainResult = {
  ok: boolean;
  entries: number;
  /** First sequence number whose hash or running total does not reconcile. */
  brokenAtSeq?: number;
  reason?: "HASH_MISMATCH" | "SEQUENCE_GAP" | "PREV_HASH_MISMATCH" | "BALANCE_MISMATCH" | "CACHE_MISMATCH";
  computedBalance?: number;
  cachedBalance?: number;
};

/**
 * Walks a user's chain and re-derives every hash and running total. Detects
 * edited rows, deleted rows, reordered rows, and a cache row that disagrees
 * with the ledger.
 */
export async function verifyChain(userId: string): Promise<ChainResult> {
  const entries = await db.pointsLedger.findMany({
    where: { userId },
    orderBy: { seq: "asc" },
  });

  let prevHash = GENESIS;
  let balance = 0;
  let locked = 0;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];

    if (e.seq !== i + 1) {
      return { ok: false, entries: entries.length, brokenAtSeq: e.seq, reason: "SEQUENCE_GAP" };
    }
    if (e.prevHash !== prevHash) {
      return { ok: false, entries: entries.length, brokenAtSeq: e.seq, reason: "PREV_HASH_MISMATCH" };
    }

    balance += e.delta;
    locked += e.lockedDelta;
    if (e.balanceAfter !== balance || e.lockedAfter !== locked) {
      return { ok: false, entries: entries.length, brokenAtSeq: e.seq, reason: "BALANCE_MISMATCH" };
    }

    const expected = entryHash({
      prevHash: e.prevHash,
      userId: e.userId,
      seq: e.seq,
      delta: e.delta,
      lockedDelta: e.lockedDelta,
      balanceAfter: e.balanceAfter,
      lockedAfter: e.lockedAfter,
      reason: e.reason,
      refType: e.refType,
      refId: e.refId,
      createdAt: e.createdAt,
    });
    if (expected !== e.hash) {
      return { ok: false, entries: entries.length, brokenAtSeq: e.seq, reason: "HASH_MISMATCH" };
    }

    prevHash = e.hash;
  }

  const cache = await db.loyaltyPoints.findUnique({
    where: { userId },
    select: { points: true, lockedPoints: true },
  });
  if (cache && (cache.points !== balance || cache.lockedPoints !== locked)) {
    return {
      ok: false,
      entries: entries.length,
      reason: "CACHE_MISMATCH",
      computedBalance: balance,
      cachedBalance: cache.points,
    };
  }

  return { ok: true, entries: entries.length, computedBalance: balance };
}
