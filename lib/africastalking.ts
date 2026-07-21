import AfricasTalking from "africastalking"

const at = process.env.AFRICASTALKING_API_KEY && process.env.AFRICASTALKING_USERNAME
  ? AfricasTalking({ apiKey: process.env.AFRICASTALKING_API_KEY, username: process.env.AFRICASTALKING_USERNAME })
  : null

export function hasAfricasTalkingConfig(): boolean {
  return !!at
}

/** Sends an SMS via Africa's Talking. Returns the provider message ID. */
export async function sendSmsAT(to: string, body: string): Promise<string> {
  if (!at) throw new Error("[AfricasTalking] not configured")

  const res = await at.SMS.send({
    to: [to],
    message: body,
    ...(process.env.AFRICASTALKING_SENDER_ID ? { from: process.env.AFRICASTALKING_SENDER_ID } : {}),
  })
  const recipient = res.SMSMessageData.Recipients[0]
  if (recipient?.status !== "Success") {
    throw new Error(`[AfricasTalking] send failed: ${recipient?.status} (${recipient?.statusCode})`)
  }
  return recipient.messageId
}
