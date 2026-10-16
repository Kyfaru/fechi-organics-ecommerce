/**
 * Callback hardening shared by the STK callback routes:
 *  - signed callback URLs (HMAC of the transaction id) so a forged POST that
 *    merely guesses a CheckoutRequestID can be told apart from a real one;
 *  - the durable inbox (paymentCallbackInbox) every callback is filed in
 *    before any business logic runs;
 *  - the paid-amount check.
 *
 * Signature enforcement is OFF by default: whether KCB preserves a query
 * string on the callback URL is unverified, and rejecting real callbacks
 * would mean paid-but-unconfirmed orders. Without enforcement a bad/missing
 * signature is recorded (hmacOk) and logged only. Set
 * PAYMENT_CALLBACK_ENFORCE_SIG=1 once a stage callback is seen carrying it.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { reportError } from "@/lib/observability";
import type { Prisma } from "@prisma/client";

function secret(): string | null {
  return process.env.PAYMENT_CALLBACK_SECRET ?? process.env.BETTER_AUTH_SECRET ?? null;
}

export function signTx(txId: string): string | null {
  const s = secret();
  return s ? createHmac("sha256", s).update(`stk:${txId}`).digest("hex").slice(0, 32) : null;
}

/** Appends ?tx=<id>&sig=<hmac> — a no-op (plain URL) when no secret is configured. */
export function signedCallbackUrl(url: string, txId: string): string {
  const sig = signTx(txId);
  return sig ? `${url}?tx=${encodeURIComponent(txId)}&sig=${sig}` : url;
}

/** null = nothing to verify (no tx/sig present or no secret); boolean = checked. */
export function verifySignature(txId: string | null, sig: string | null): boolean | null {
  const expected = txId ? signTx(txId) : null;
  if (!txId || !sig || !expected) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signatureEnforced(): boolean {
  return process.env.PAYMENT_CALLBACK_ENFORCE_SIG === "1";
}

/**
 * Files a callback. Returns the row id and whether it was a duplicate (a
 * gateway retry hits the unique dedupeKey). Never throws — losing the inbox
 * write must not stop the payment from being processed.
 */
export async function fileCallback(args: {
  source: "kcb" | "instore-stk";
  checkoutRequestId: string;
  resultCode: number;
  raw: unknown;
  hmacOk: boolean | null;
}): Promise<{ id: string | null; duplicate: boolean }> {
  try {
    const row = await db.paymentCallbackInbox.create({
      data: {
        dedupeKey: `${args.source}:${args.checkoutRequestId}:${args.resultCode}`,
        source: args.source,
        rawPayload: args.raw as Prisma.InputJsonValue,
        hmacOk: args.hmacOk,
      },
      select: { id: true },
    });
    return { id: row.id, duplicate: false };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { id: null, duplicate: true };
    reportError(e, { route: "callback-guard", tags: { stage: "inbox_write" } });
    return { id: null, duplicate: false };
  }
}

export async function settleCallback(id: string | null, outcome: string): Promise<void> {
  if (!id) return;
  try {
    await db.paymentCallbackInbox.update({ where: { id }, data: { outcome, processedAt: new Date() } });
  } catch (e) {
    reportError(e, { route: "callback-guard", tags: { stage: "inbox_settle" } });
  }
}

/**
 * The gateway reports whole KES; transaction.amount is cents. STK pushes are
 * sent in whole KES (kcb-client rounds cents/100), so a KES 0.85 or KES 1250.50
 * order legitimately settles as KES 1 / KES 1251 — compare within 1 KES, not
 * for equality, or real payments get rejected. A callback with no Amount item
 * is not rejected (we can't prove a mismatch).
 */
export function amountMatches(callbackAmountKes: unknown, expectedCents: number): boolean {
  if (callbackAmountKes === undefined || callbackAmountKes === null || callbackAmountKes === "") return true;
  const kes = Number(callbackAmountKes);
  if (!Number.isFinite(kes)) return true;
  return Math.abs(kes * 100 - expectedCents) < 100;
}
