import { Client, Receiver } from "@upstash/qstash";

export const qstash: Client = process.env.QSTASH_TOKEN
  ? new Client({ 
    baseUrl: process.env.QSTASH_URL,
    token: process.env.QSTASH_TOKEN, })
  : ({
      async publishJSON(request: Parameters<Client["publishJSON"]>[0]) {
        console.warn("[qstash] Skipping publish; Qstash token is not configured", request.url);
        return { messageId: "qstash-disabled" };
      },
    } as unknown as Client);

export const qstashReceiver =
  process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY
    ? new Receiver({
        currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
        nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
      })
    : {
        async verify() {
          return process.env.NODE_ENV !== "production";
        },
      };

export async function verifyQstashRequest(signature: string | null, body: string) {
  if (!signature) return false;
  return qstashReceiver.verify({ signature, body });
}

export async function publishQstashJSON(
  pathOrUrl: string,
  body: unknown,
  // delay: relative, in seconds, from publish time (existing behavior).
  // notBefore: absolute Unix timestamp in seconds — used for exact-time scheduling
  // (e.g. a user-picked "send at" datetime) where a relative delay isn't precise enough.
  opts?: { delay?: number; notBefore?: number }
) {
  // The destination QStash delivers the job TO must be THIS app's own public
  // URL — never QSTASH_URL, which is Upstash's own QStash API endpoint
  // (e.g. https://qstash-eu-central-1.upstash.io). A prior change wired this
  // to QSTASH_URL, which made every publish target a nonexistent path on
  // Upstash's domain instead of this app: QStash 404s trying to deliver it,
  // retries, gives up, and the worker route is never actually invoked —
  // campaigns (and every other Qstash-triggered job) get stuck mid-flight
  // with no error, since the enqueue call itself still "succeeds".
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.MPESA_CALLBACK_BASE_URL;
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${baseUrl?.replace(/\/$/, "")}${pathOrUrl}`;

  if (!baseUrl) {
    console.warn("[qstash] Skipping publish; app base URL is not configured", pathOrUrl);
    return null;
  }
  if (/(^|\.)upstash\.io$/.test(new URL(baseUrl).hostname)) {
    console.error(
      `[qstash] Refusing to publish — destination base URL "${baseUrl}" is Upstash's own QStash endpoint, not this app's public URL. Set NEXT_PUBLIC_APP_URL to this app's real domain.`
    );
    return null;
  }

  return qstash.publishJSON({
    url,
    body,
    // notBefore overrides delay when both are set, so only send one
    ...(opts?.notBefore ? { notBefore: opts.notBefore } : opts?.delay ? { delay: opts.delay } : {}),
  });
}
