import type { TransactionEventType } from "@prisma/client";

// Coarse categorization of a failure reason string into the transaction
// timeline's event type — the exact text is always preserved verbatim on
// transaction.failureReason / transactionEvent.detail; this only decides
// which bucket the admin timeline shows it under. Matches the actual reason
// strings produced by the callback routes ("1032:Request cancelled by user",
// "1037:DS timeout user cannot be reached") and the timeout workers
// ("Payment timed out after N minutes with no callback").
export function classifyFailureReason(reason?: string | null): TransactionEventType {
  const r = (reason ?? "").toLowerCase();
  if (r.includes("1032") || r.includes("cancelled by user") || r.includes("canceled by user")) {
    return "CANCELLED_BY_USER";
  }
  if (r.includes("1037") || r.includes("timed out") || r.includes("timeout")) {
    return "TIMED_OUT";
  }
  return "FAILED";
}
