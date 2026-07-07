import { Client, Receiver } from "@upstash/qstash";

export const qstash: Client = process.env.QSTASH_TOKEN
  ? new Client({ token: process.env.QSTASH_TOKEN })
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
  const baseUrl = process.env.QSTASH_URL;
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${baseUrl?.replace(/\/$/, "")}${pathOrUrl}`;

  if (!baseUrl) {
    console.warn("[qstash] Skipping publish; app URL is not configured", pathOrUrl);
    return null;
  }

  return qstash.publishJSON({
    url,
    body,
    // notBefore overrides delay when both are set, so only send one
    ...(opts?.notBefore ? { notBefore: opts.notBefore } : opts?.delay ? { delay: opts.delay } : {}),
  });
}
