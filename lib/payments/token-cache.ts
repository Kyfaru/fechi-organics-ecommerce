/**
 * Shared Redis token cache for the payment gateways (KCB Buni, Daraja).
 *
 * Stores {token, expiresAt} and refuses a token with < REFRESH_MARGIN_S left,
 * so a token is replaced a few minutes BEFORE the gateway expires it. A short
 * NX lock stops concurrent pushes from each minting their own token.
 * Legacy bare-string cache entries fail the shape check and are re-minted.
 *
 * Redis is an optimisation here, never a dependency: every Redis call is
 * guarded, and an outage just means each push mints its own token.
 */

import { getRedis } from "@/lib/redis";
import { reportError } from "@/lib/observability";

const REFRESH_MARGIN_S = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readToken(raw: unknown): string | null {
  // Upstash auto-parses JSON; tolerate a still-stringified value too.
  let v = raw;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return null; }
  }
  const e = v as { token?: unknown; expiresAt?: unknown } | null;
  if (!e || typeof e.token !== "string" || typeof e.expiresAt !== "number") return null;
  return e.expiresAt - Date.now() > REFRESH_MARGIN_S * 1000 ? e.token : null;
}

async function safely<T>(stage: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    reportError(e, { route: "token-cache", tags: { stage } });
    return null;
  }
}

export async function getOrMintToken(
  key: string,
  mint: () => Promise<{ token: string; expiresInS: number }>,
  opts: { fresh?: boolean } = {},
): Promise<{ token: string; cached: boolean }> {
  const redis = getRedis();

  if (!opts.fresh) {
    const hit = readToken(await safely("get", () => redis.get(key)));
    if (hit) return { token: hit, cached: true };
  }

  // Another caller is already minting — wait briefly for its result.
  const gotLock = await safely("lock", () => redis.set(`${key}:lock`, "1", { nx: true, ex: 10 }));
  if (!gotLock && !opts.fresh) {
    for (let i = 0; i < 5; i++) {
      await sleep(300);
      const hit = readToken(await safely("get", () => redis.get(key)));
      if (hit) return { token: hit, cached: true };
    }
  }

  const { token, expiresInS } = await mint();
  const margin = expiresInS > 2 * REFRESH_MARGIN_S ? REFRESH_MARGIN_S : 60;
  await safely("set", () =>
    redis.set(key, JSON.stringify({ token, expiresAt: Date.now() + expiresInS * 1000 }), {
      ex: Math.max(60, expiresInS - margin),
    }),
  );
  return { token, cached: false };
}
