/**
 * Single home for "send an STK push, fail over to the other gateway if (and
 * only if) the first one provably sent nothing." Replaces three near-copies
 * of this logic that used to live inline in the initiate routes
 * (app/api/payments/mpesa/initiate, app/api/payments/kcb/initiate,
 * app/api/admin/orders/instore/mpesa/initiate) — kcb/initiate had no
 * failover at all, so this also makes all three behave alike.
 *
 * Deliberately does no DB I/O — callers (the dispatch-stk worker route) own
 * loading the transaction, persisting the result, and firing the SSE event.
 * That keeps this file pure enough to unit-test and reusable for both the
 * online (order/transaction) and in-store (inStoreOrder/inStoreTransaction)
 * data models, which is why every DB row it needs comes in as a plain value.
 */

import type { branch, MpesaGateway } from "@prisma/client";
import { decrypt } from "@/lib/crypto";
import { assertBranchNotSandbox } from "@/lib/payments/gateway-env";
import { resolveMpesaGateway, otherGateway, resolvePaymentBranch } from "@/lib/payments/mpesa/gateway";
import { resolveKcbBranch, originBranchTag } from "@/lib/payments/kcb/resolve-kcb-branch";
import { initiateKcbStkPush } from "@/lib/payments/kcb/kcb-client";
import { getDarajaToken } from "@/lib/payments/mpesa/daraja-client";
import { initiateSTKPush } from "@/lib/payments/mpesa/stk-push";
import { StkSendError } from "@/lib/payments/stk-errors";

export type StkDispatchInput = {
  branch: branch; // the customer's real branch — order.branchId, unchanged by credential swaps below
  phone: string;
  amountCents: number;
  orderId: string;
  orderNumber: string | null;
  // Only affects the account-reference slice depth (kept identical to each
  // flow's pre-existing convention — see AccountReference double-slice in
  // the deferred items list; not something this change fixes).
  kind: "online" | "instore";
  kcbCallbackUrl: string;
  darajaCallbackUrl: string;
};

export type StkDispatchResult =
  | { success: true; checkoutRequestId: string; gatewayUsed: MpesaGateway }
  | { success: false; reason: string; gatewayAttempted: MpesaGateway };

function isFailoverEligible(err: unknown): boolean {
  // A StkSendError explicitly says whether the gateway sent nothing; any
  // other exception (decrypt failure, resolveKcbBranch finding no credentials
  // at all, a phone-format throw) happened before/outside the network call
  // that carries ambiguity, so it's as safe to fail over on as it always was.
  if (err instanceof StkSendError) return err.sentNothing;
  return true;
}

// resolvePaymentBranch's credential swap only ever applied to the online
// flow (see the original app/api/payments/mpesa/initiate/route.ts) — in-store
// never called it. Gating on `kind` here, rather than applying it
// unconditionally, matters: isBranchLimitedDelivery() defaults to true, so
// applying it to in-store too would silently rebill a branch-scoped admin's
// walk-in sale (e.g. Eldoret) against Nairobi's credentials instead of that
// branch's own — a real mis-attribution, not a hypothetical one.
async function resolveDispatchBranch(input: StkDispatchInput): Promise<branch> {
  return input.kind === "online" ? resolvePaymentBranch(input.branch) : input.branch;
}

async function dispatchKcb(input: StkDispatchInput): Promise<string> {
  const paymentBranch = await resolveDispatchBranch(input);
  const kcbBranch = await resolveKcbBranch(paymentBranch);

  if (kcbBranch.apiKeyEnc) {
    assertBranchNotSandbox(kcbBranch.id, { kcbApiKey: decrypt(kcbBranch.apiKeyEnc) });
  }

  const orderSlice = input.kind === "online" ? input.orderNumber?.slice(4, -1) : input.orderNumber?.slice(7, -1);
  const invoiceCode = `${kcbBranch.invoiceNumber}-${originBranchTag(input.branch)}-${orderSlice}`;

  const res = await initiateKcbStkPush({
    branch: {
      id: kcbBranch.id,
      shortcode: kcbBranch.shortcode,
      invoiceNumber: invoiceCode,
      consumerKeyEnc: kcbBranch.consumerKeyEnc,
      consumerSecretEnc: kcbBranch.consumerSecretEnc,
      apiKeyEnc: kcbBranch.apiKeyEnc ?? null,
    },
    phone: input.phone,
    amountKes: input.amountCents,
    orderId: input.orderId,
    callbackUrl: input.kcbCallbackUrl,
  });

  return res.CheckoutRequestID;
}

async function dispatchDaraja(input: StkDispatchInput): Promise<string> {
  const paymentBranch = await resolveDispatchBranch(input);

  // A branch with no Daraja passkey/shortcode will throw inside
  // initiateSTKPush regardless — check up front so a fallback attempt fails
  // in milliseconds instead of after a full (up to 10s) token round trip.
  if (!paymentBranch.passkeyEnc || !paymentBranch.shortcode) {
    throw new StkSendError(
      `Branch ${paymentBranch.id} has no Daraja passkey/shortcode configured`,
      true,
    );
  }

  if (paymentBranch.passkeyEnc) {
    assertBranchNotSandbox(paymentBranch.id, {
      daraja: { shortcode: paymentBranch.shortcode, passkey: decrypt(paymentBranch.passkeyEnc) },
    });
  }

  await getDarajaToken(paymentBranch); // warm-up / validate credentials early
  const orderRef =
    input.kind === "online"
      ? (input.orderNumber ?? input.orderId)
      : (input.orderNumber?.slice(7, -1) ?? input.orderId);

  const res = await initiateSTKPush({
    branch: paymentBranch,
    phone: input.phone,
    amountKes: input.amountCents / 100,
    orderId: orderRef,
    callbackUrl: input.darajaCallbackUrl,
  });

  return res.CheckoutRequestID;
}

async function dispatchByGateway(gateway: MpesaGateway, input: StkDispatchInput): Promise<string> {
  return gateway === "KCB_BUNI" ? dispatchKcb(input) : dispatchDaraja(input);
}

/**
 * Dispatches an STK push, failing over to the other gateway only when the
 * primary attempt provably sent nothing (see stk-errors.ts). On a total
 * failure, the returned reason is the PRIMARY gateway's real error — never
 * the old generic "Both M-Pesa gateways failed to initiate" string, which
 * threw away the one piece of information needed to diagnose it.
 */
export async function dispatchStk(input: StkDispatchInput): Promise<StkDispatchResult> {
  const primaryGateway = resolveMpesaGateway(input.branch);
  const fallbackGateway = otherGateway(primaryGateway);

  try {
    const checkoutRequestId = await dispatchByGateway(primaryGateway, input);
    return { success: true, checkoutRequestId, gatewayUsed: primaryGateway };
  } catch (primaryErr) {
    const primaryReason = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);

    if (!isFailoverEligible(primaryErr)) {
      // The primary gateway answered (a 2xx, a 4xx, or a real rejection) —
      // retrying the other gateway risks a second prompt or a double debit.
      // Surface exactly what the primary said instead of guessing further.
      return { success: false, reason: primaryReason, gatewayAttempted: primaryGateway };
    }

    try {
      const checkoutRequestId = await dispatchByGateway(fallbackGateway, input);
      return { success: true, checkoutRequestId, gatewayUsed: fallbackGateway };
    } catch (fallbackErr) {
      const fallbackReason = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      // Both failed — keep the PRIMARY's reason, since that's almost always
      // the actual misconfiguration (the fallback gateway is often off by
      // design, e.g. Daraja while DARAJA_ENABLED=false) and burying it in
      // Sentry while showing the customer a generic string is what made this
      // bug take so long to diagnose in the first place.
      console.error(
        `[dispatch-stk] both gateways failed — primary=${primaryGateway} (${primaryReason}) fallback=${fallbackGateway} (${fallbackReason})`,
      );
      return { success: false, reason: primaryReason, gatewayAttempted: primaryGateway };
    }
  }
}
