/**
 * Pure helpers for turning a raw error into the plain-language admin-facing
 * shape stored on `errorLog` (code/category/message). No `db` or Node-only
 * imports here — this stays safe to import from anywhere, server or client,
 * unlike lib/observability-server.ts which actually writes the row.
 */

const GATEWAY_KEYWORDS = ["daraja", "stk-push", "stk push", "kcb", "safaricom", "mpesa", "paystack", "timeout", "gateway"];

const PRISMA_CODE_MESSAGES: Record<string, string> = {
  P2002: "Duplicate record — usually two things were created at the same instant",
  P2003: "Reference to something that doesn't exist (a deleted or invalid related record)",
  P2025: "Record not found — it may have been deleted",
};

/** Extracts a Prisma/HTTP/gateway code from an error, when one is available. */
export function extractErrorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) return code;
    if (typeof code === "number") return String(code);
  }
  return null;
}

/** Coarse bucket for the raw code/message — drives grouping, not the headline. */
export function categorizeErrorLog(code: string | null, message: string): string {
  if (code?.startsWith("P2")) return "database";
  const lower = message.toLowerCase();
  if (GATEWAY_KEYWORDS.some((k) => lower.includes(k))) return "payment_gateway";
  return "server";
}

/**
 * Plain-language headline for a non-technical admin. The raw code/category
 * stay visible alongside this in the UI — this only adds a friendly summary,
 * it never hides the underlying detail.
 */
export function interpretErrorLog(log: { code: string | null; category: string; message: string }): string {
  if (log.code && PRISMA_CODE_MESSAGES[log.code]) return PRISMA_CODE_MESSAGES[log.code];
  if (log.category === "payment_gateway") {
    const lower = log.message.toLowerCase();
    if (lower.includes("timeout") || lower.includes("timed out")) return "Payment provider didn't respond in time";
    return "The payment provider (M-Pesa/KCB/Paystack) rejected or failed the request";
  }
  return "Unexpected server error";
}
