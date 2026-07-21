import type { MpesaGateway } from "@prisma/client";

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
