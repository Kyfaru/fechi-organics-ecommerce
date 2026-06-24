import twilio from 'twilio'

const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

/** Sends an SMS message to the given phone number. */
export async function sendSms(to: string, body: string) {
  await client.messages.create({ body, from: process.env.TWILIO_PHONE_NUMBER!, to })
}

// ponytail: WhatsApp stub — wire when approved sender configured
export async function sendWhatsApp(to: string, body: string) {
  console.warn('[WhatsApp stub] Would send to', to, ':', body)
}
