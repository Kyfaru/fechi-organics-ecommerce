import type { MpesaGateway, branch } from "@prisma/client";
import { db } from "@/lib/db";
import { isBranchLimitedDelivery } from "@/lib/delivery-mode";

/**
 * Daraja API access isn't live yet. Until DARAJA_ENABLED=true, every branch
 * routes through KCB Buni regardless of its configured mpesaGateway — flip
 * the env var once Daraja access is ready to restore per-branch dispatch.
 */
export function resolveMpesaGateway(branch: { mpesaGateway: MpesaGateway }): MpesaGateway {
  if (process.env.DARAJA_ENABLED !== "true") return "KCB_BUNI";
  return branch.mpesaGateway;
}

export function otherGateway(gateway: MpesaGateway): MpesaGateway {
  return gateway === "KCB_BUNI" ? "DARAJA" : "KCB_BUNI";
}

/**
 * Real, production-ready M-Pesa credentials only exist for Nairobi and Nakuru
 * today — see prisma/seed.ts and lib/delivery-mode.ts. While branch-limited
 * delivery is on, any other branch's STK/KCB push settles through Nairobi's
 * paybill instead of its own (still-placeholder) credentials.
 *
 * The order itself keeps recording the customer's REAL branch
 * (order.branchId / transaction.branchId) — this only swaps which
 * credentials the gateway call uses, the same way resolveKcbBranch.ts
 * already swaps credentials-only for Eldoret/Kitengela/Mwea's missing KCB
 * Buni invoice numbers.
 */
export async function resolvePaymentBranch(orderBranch: branch): Promise<branch> {
  if (!isBranchLimitedDelivery()) return orderBranch;
  // Matched by county (branch.county), not the freeform display name, since
  // that's the same stable identifier prisma/seed.ts and the checkout's
  // PICKUP_STORES list already key branches by.
  if (orderBranch.county === "Nakuru") return orderBranch;

  const nairobi = await db.branch.findFirst({ where: { isMain: true, isActive: true } });
  return nairobi ?? orderBranch;
}
