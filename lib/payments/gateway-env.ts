/**
 * Startup/request-entry guards that turn a misconfigured M-Pesa gateway into
 * a loud, immediate error instead of a silent 40-second round trip that ends
 * in "1037: DS timeout user cannot be reached" with no prompt ever reaching
 * a real handset — the signature of a sandbox/UAT gateway accepting the
 * request and never dispatching it.
 *
 * assertGatewayEnv() checks the environment (host URLs, DARAJA_ENV, callback
 * base) and is cheap enough to call on every initiate request. It only
 * enforces in production — dev/staging are expected to run against sandbox.
 * "Production" here means NODE_ENV=production AND APP_STAGE is unset or
 * "production" — `next build`/the Docker image sets NODE_ENV=production for
 * ANY production-mode deploy, including staging, so NODE_ENV alone can't
 * tell staging apart from the real production deployment. Set
 * APP_STAGE=staging (or any value other than "production") on the staging
 * deploy to let it run against KCB/Daraja sandbox hosts and credentials.
 *
 * assertBranchNotSandbox() checks the actual per-branch credentials once
 * they're decrypted, because pointing at the right host is not sufficient:
 * a branch can be seeded with Safaricom's own PUBLIC sandbox test constants
 * (shortcode 174379 + the publicly documented passkey) or a KCB Buni apiKey
 * whose embedded JWT claims `"keytype":"SANDBOX"` — both accepted here, both
 * confirmed present in this project's seed data at the time this was added.
 */

// Safaricom's publicly documented Daraja sandbox test constants
// (developer.safaricom.co.ke) — never valid in production.
const SANDBOX_DARAJA_SHORTCODE = "174379";
const SANDBOX_DARAJA_PASSKEY =
  "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";

/** True on a deploy that should enforce production-only gateway rules — see
 * the module doc comment for why this isn't just NODE_ENV === "production". */
function isProductionDeploy(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  return !process.env.APP_STAGE || process.env.APP_STAGE === "production";
}

export function assertGatewayEnv(): void {
  if (!isProductionDeploy()) return;

  const kcbBase = process.env.KCB_BASE_URL ?? "";
  if (!kcbBase) {
    throw new Error("[gateway-env] KCB_BASE_URL is not set in production.");
  }
  if (/uat\.|sandbox/i.test(kcbBase)) {
    throw new Error(`[gateway-env] KCB_BASE_URL points at a non-production host: "${kcbBase}"`);
  }

  if (process.env.DARAJA_ENV !== "production") {
    throw new Error(
      `[gateway-env] DARAJA_ENV must be exactly "production" in production (got ${JSON.stringify(process.env.DARAJA_ENV)}). lib/payments/mpesa/stk-push.ts only uses the live Safaricom host on an exact match — anything else silently targets sandbox.safaricom.co.ke.`,
    );
  }

  for (const [name, base] of [
    ["MPESA_CALLBACK_BASE_URL", process.env.MPESA_CALLBACK_BASE_URL],
    ["KCB_CALLBACK_BASE_URL", process.env.KCB_CALLBACK_BASE_URL ?? process.env.MPESA_CALLBACK_BASE_URL],
  ] as const) {
    if (!base || !/^https:\/\//.test(base) || base.includes("undefined")) {
      throw new Error(
        `[gateway-env] ${name} resolves to ${JSON.stringify(base ?? null)} — must be a real https:// public URL. A gateway cannot deliver a callback to this.`,
      );
    }
  }
}

/** Decodes a JWT's payload without verifying the signature — used only to
 * read the `keytype`/`iss` claims KCB Buni embeds, never for auth. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Throws if the decrypted credentials for this branch are recognisably
 * sandbox — independent of which host they're being sent to. Call this once
 * credentials are decrypted, right before dispatch, for both gateways.
 */
export function assertBranchNotSandbox(
  branchId: string,
  creds: { daraja?: { shortcode: string; passkey: string } | null; kcbApiKey?: string | null },
): void {
  if (!isProductionDeploy()) return;

  if (
    creds.daraja &&
    creds.daraja.shortcode === SANDBOX_DARAJA_SHORTCODE &&
    creds.daraja.passkey === SANDBOX_DARAJA_PASSKEY
  ) {
    throw new Error(
      `[gateway-env] branch=${branchId} is configured with Safaricom's PUBLIC sandbox shortcode/passkey (174379). This will never reach a real handset in production — rotate this branch's Daraja credentials.`,
    );
  }

  if (creds.kcbApiKey) {
    const claims = decodeJwtPayload(creds.kcbApiKey);
    const iss = typeof claims?.iss === "string" ? claims.iss : "";
    const keytype = typeof claims?.keytype === "string" ? claims.keytype : "";
    if (/sandbox\.buni\.kcbgroup\.com/i.test(iss) || keytype.toUpperCase() === "SANDBOX") {
      throw new Error(
        `[gateway-env] branch=${branchId}'s KCB Buni apiKey is a SANDBOX credential (iss="${iss}", keytype="${keytype}") — rotate this branch's KCB Buni credentials from the production Buni app, not UAT.`,
      );
    }
  }
}
