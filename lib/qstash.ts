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

export async function publishQstashJSON(pathOrUrl: string, body: unknown, opts?: { delay?: number }) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.MPESA_CALLBACK_BASE_URL;
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
    ...(opts?.delay ? { delay: opts.delay } : {}),
  });
}
