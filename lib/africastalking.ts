const USERNAME = process.env.AFRICASTALKING_USERNAME
const API_KEY = process.env.AFRICASTALKING_API_KEY
const SENDER_ID = process.env.AFRICASTALKING_SENDER_ID
const IS_SANDBOX = USERNAME?.toLowerCase() === "sandbox"

// Live bulk SMS moved to a JSON endpoint (see docs). Sandbox for that endpoint is
// not available yet ("coming soon"), so sandbox still uses the legacy form-encoded one.
const BULK_URL = "https://api.africastalking.com/version1/messaging/bulk"
const LEGACY_URL = `https://api.${IS_SANDBOX ? "sandbox." : ""}africastalking.com/version1/messaging`

interface AtRecipient {
  number: string
  status: string
  statusCode: number
  messageId: string
  cost: string
}

interface AtResponse {
  SMSMessageData?: { Message: string; Recipients: AtRecipient[] }
}

export function hasAfricasTalkingConfig(): boolean {
  return !!(USERNAME && API_KEY)
}

/** Sends an SMS via Africa's Talking. Returns the provider message ID. */
export async function sendSmsAT(to: string, body: string): Promise<string> {
  if (!USERNAME || !API_KEY) throw new Error("[AfricasTalking] not configured")

  const headers = { apiKey: API_KEY, Accept: "application/json" }
  const res = IS_SANDBOX
    ? await fetch(LEGACY_URL, {
        method: "POST",
        headers,
        body: new URLSearchParams({
          username: USERNAME,
          to,
          message: body,
          bulkSMSMode: "1",
          ...(SENDER_ID ? { from: SENDER_ID } : {}),
        }),
      })
    : await fetch(BULK_URL, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ username: USERNAME, message: body, senderId: SENDER_ID, phoneNumbers: [to] }),
      })

  const data: AtResponse = await res.json()
  const recipient = data.SMSMessageData?.Recipients?.[0]
  if (!res.ok || recipient?.status !== "Success") {
    throw new Error(`[AfricasTalking] send failed: ${recipient?.status ?? res.status} (${recipient?.statusCode})`)
  }
  return recipient.messageId
}
