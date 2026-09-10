import twilio from 'twilio'

let _client: ReturnType<typeof twilio> | null = null
function getClient() {
  if (!_client) {
    _client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  }
  return _client
}

export function hasTwilioConfig(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER)
}

/** Sends an SMS message to the given phone number. Returns the Twilio message SID. */
export async function sendSms(to: string, body: string, statusCallback?: string) {
  const message = await getClient().messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER!,
    to,
    ...(statusCallback ? { statusCallback } : {}),
  })
  return message.sid
}

// ponytail: WhatsApp stub — wire when approved sender configured
export async function sendWhatsApp(to: string, body: string) {
  console.warn('[WhatsApp stub] Would send to', to, ':', body)
}
