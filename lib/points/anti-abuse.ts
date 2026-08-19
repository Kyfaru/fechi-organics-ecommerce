/**
 * Stops one person farming the joining bonus across many accounts.
 *
 * Two mechanisms, and the first does most of the work:
 *
 * 1. The 4,000-point signup bonus and the 500-point referred bonus are written
 *    LOCKED and are unspendable until the customer's first successful payment.
 *    Creating an email address is free; completing a real payment is not.
 *
 * 2. At that moment we score the account against every signal we have seen on
 *    other accounts. The payment instrument carries the most weight — an M-Pesa
 *    MSISDN or a Paystack card fingerprint is a bank-verified identity, far
 *    harder to fake than a device or an IP.
 *
 * Order points are never gated: they are backed by real money, so there is
 * nothing to farm.
 *
 * A shared IP alone never blocks. Families, offices and shared Wi-Fi are normal
 * in Kenya, and a false accusation costs more than a duplicate bonus.
 */

import { createHmac } from "crypto";
import type { IdentityKind } from "@prisma/client";
import { db } from "@/lib/db";
import { awardPoints } from "@/lib/points/ledger";
import { createNotification } from "@/lib/notify";
import { normalizePhoneE164, combineLegacyPhone } from "@/lib/phone";

/** How suspicious each shared signal is. */
const WEIGHTS: Record<IdentityKind, number> = {
  PAY_MPESA: 100,
  PAY_CARD: 100,
  PHONE: 80,
  EMAIL_NORM: 60,
  DEVICE: 40,
  IP: 15,
};

/** At or above this, the bonus is voided. Below it but above FLAG_AT, it is flagged for review. */
export const VOID_AT = 100;
export const FLAG_AT = 15;

function hashValue(kind: IdentityKind, raw: string): string {
  return createHmac("sha256", process.env.REDIS_CHANNEL_SECRET ?? "dev-secret")
    .update(`${kind}:${raw.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 40);
}

/**
 * Normalises an email so aliases of one mailbox collapse together:
 * gmail dots are insignificant, and everything after a "+" is a tag.
 */
export function normalizeEmail(email: string): string {
  const [localRaw, domainRaw] = email.trim().toLowerCase().split("@");
  if (!domainRaw) return email.trim().toLowerCase();
  let local = localRaw.split("+")[0];
  if (domainRaw === "gmail.com" || domainRaw === "googlemail.com") {
    local = local.replace(/\./g, "");
    return `${local}@gmail.com`;
  }
  return `${local}@${domainRaw}`;
}

/** Collapses an IPv4 address to its /24, so a whole household reads as one signal. */
export function ipSubnet(ip: string): string {
  const v4 = ip.trim().split(":")[0];
  const parts = v4.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  return ip.trim();
}

/** Records a signal for a user. Never throws — a missed signal must not break a payment. */
export async function recordSignal(userId: string, kind: IdentityKind, rawValue: string | null | undefined) {
  if (!rawValue) return;
  try {
    const valueHash = hashValue(kind, rawValue);
    await db.identitySignal.upsert({
      where: { userId_kind_valueHash: { userId, kind, valueHash } },
      create: { userId, kind, valueHash },
      update: { lastSeenAt: new Date() },
    });
  } catch (e) {
    console.error("[anti-abuse] recordSignal failed", kind, e);
  }
}

export type RiskAssessment = {
  score: number;
  reasons: Array<{ kind: IdentityKind; sharedWith: number; weight: number }>;
};

/** Sums the weight of every signal this account shares with a different account. */
export async function assessRisk(userId: string): Promise<RiskAssessment> {
  const signals = await db.identitySignal.findMany({
    where: { userId },
    select: { kind: true, valueHash: true },
  });

  const reasons: RiskAssessment["reasons"] = [];
  let score = 0;

  for (const s of signals) {
    const sharedWith = await db.identitySignal.count({
      where: { kind: s.kind, valueHash: s.valueHash, userId: { not: userId } },
    });
    if (sharedWith === 0) continue;
    const weight = WEIGHTS[s.kind];
    score += weight;
    reasons.push({ kind: s.kind, sharedWith, weight });
  }

  return { score, reasons };
}

/**
 * Harvests the identity signals attached to a paid order — most importantly the
 * instrument that actually paid.
 */
export async function collectOrderSignals(args: {
  userId: string;
  orderId: string;
  refType: "order" | "inStoreOrder";
}) {
  const user = await db.user.findUnique({
    where: { id: args.userId },
    select: { email: true, phone: true, phoneCode: true },
  });
  if (user?.email) await recordSignal(args.userId, "EMAIL_NORM", normalizeEmail(user.email));
  if (user?.phone) {
    // combineLegacyPhone first — `phoneCode` is a dialling code ("+254"), not
    // the ISO country code normalizePhoneE164 expects as its second argument.
    const combined = combineLegacyPhone(user.phone, user.phoneCode);
    if (combined) await recordSignal(args.userId, "PHONE", normalizePhoneE164(combined));
  }

  const tx =
    args.refType === "order"
      ? await db.transaction.findFirst({
          where: { orderId: args.orderId, status: "SUCCESS" },
          select: { provider: true, rawCallbackPayload: true, mpesaReceiptNumber: true },
          orderBy: { id: "desc" },
        })
      : await db.inStoreTransaction.findFirst({
          where: { inStoreOrderId: args.orderId, status: "SUCCESS" },
          select: { provider: true, rawCallbackPayload: true, mpesaReceiptNumber: true },
          orderBy: { createdAt: "desc" },
        });

  if (!tx) return;

  const payload = (tx.rawCallbackPayload ?? {}) as Record<string, unknown>;

  // M-Pesa: the paying MSISDN. Daraja nests it under CallbackMetadata items;
  // KCB and the C2B feed put it at the top level under varying names.
  const msisdn = findFirstString(payload, ["PhoneNumber", "MSISDN", "msisdn", "phoneNumber", "payerPhone"]);
  if (msisdn) await recordSignal(args.userId, "PAY_MPESA", msisdn);

  // Paystack: `authorization.signature` is a stable fingerprint of the card
  // itself, so the same card across two accounts is visible without ever
  // storing a PAN.
  const signature = findFirstString(payload, ["signature"]);
  if (signature) await recordSignal(args.userId, "PAY_CARD", signature);
}

/**
 * Depth-first search for the first string value under any of `keys`.
 * Exported for testing — the three gateways nest the payer differently.
 */
export function findFirstString(obj: unknown, keys: string[], depth = 0): string | null {
  if (depth > 6 || obj === null || typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const found = findFirstString(v, keys, depth + 1);
      if (found) return found;
    }
    // Daraja's CallbackMetadata is [{ Name, Value }] — match on Name too.
    for (const v of obj) {
      if (v && typeof v === "object" && "Name" in v && "Value" in v) {
        const item = v as { Name: unknown; Value: unknown };
        if (typeof item.Name === "string" && keys.includes(item.Name) && item.Value != null) {
          return String(item.Value);
        }
      }
    }
    return null;
  }
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  for (const v of Object.values(rec)) {
    const found = findFirstString(v, keys, depth + 1);
    if (found) return found;
  }
  return null;
}

export type UnlockResult = {
  unlockedPoints: number;
  voided: boolean;
  score: number;
};

/**
 * Releases the locked joining bonus after a first real payment, or voids it if
 * this account looks like somebody's second go at the same bonus.
 */
export async function unlockJoiningBonus(args: {
  userId: string;
  orderId: string;
  refType: "order" | "inStoreOrder";
}): Promise<UnlockResult> {
  const loyalty = await db.loyaltyPoints.findUnique({
    where: { userId: args.userId },
    select: { lockedPoints: true },
  });
  const locked = loyalty?.lockedPoints ?? 0;
  if (locked <= 0) return { unlockedPoints: 0, voided: false, score: 0 };

  await collectOrderSignals(args);
  const risk = await assessRisk(args.userId);

  // A shared IP on its own is a household, not a fraudster.
  const onlyIp = risk.reasons.length > 0 && risk.reasons.every((r) => r.kind === "IP");
  const shouldVoid = risk.score >= VOID_AT && !onlyIp;

  if (shouldVoid) {
    await awardPoints({
      userId: args.userId,
      lockedDelta: -locked,
      reason: "BONUS_VOIDED_ABUSE",
      refType: "abuse",
      refId: args.orderId,
      meta: { score: risk.score, reasons: risk.reasons },
    });
    await db.pointsAbuseFlag.create({
      data: { userId: args.userId, score: risk.score, reasons: risk.reasons, action: "VOIDED" },
    });
    createNotification({
      type: "LOYALTY_ABUSE_FLAG",
      title: "Joining bonus voided",
      body: `An account scored ${risk.score} on duplicate-identity signals and its ${locked.toLocaleString()}-point joining bonus was voided.`,
      link: "/admin/loyalty/flags",
      branchId: null,
    }).catch(() => {});
    return { unlockedPoints: 0, voided: true, score: risk.score };
  }

  await awardPoints({
    userId: args.userId,
    delta: locked,
    lockedDelta: -locked,
    reason: "SIGNUP_BONUS",
    refType: "unlock",
    refId: args.orderId,
    meta: { score: risk.score },
  });

  if (risk.score >= FLAG_AT) {
    await db.pointsAbuseFlag.create({
      data: { userId: args.userId, score: risk.score, reasons: risk.reasons, action: "FLAGGED" },
    });
  }

  return { unlockedPoints: locked, voided: false, score: risk.score };
}
