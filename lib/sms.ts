import { sendSms as sendSmsTwilio, hasTwilioConfig } from "@/lib/twilio"
import { sendSmsAT, hasAfricasTalkingConfig } from "@/lib/africastalking"
import { normalizePhoneE164, getPhoneCountry } from "@/lib/phone"

export function hasSmsConfig(): boolean {
  return hasTwilioConfig() || hasAfricasTalkingConfig()
}

type Provider = "at" | "twilio"

function dispatch(provider: Provider, to: string, body: string, statusCallback?: string) {
  return provider === "at" ? sendSmsAT(to, body) : sendSmsTwilio(to, body, statusCallback)
}

function isConfigured(provider: Provider): boolean {
  return provider === "at" ? hasAfricasTalkingConfig() : hasTwilioConfig()
}

/**
 * Sends an SMS, routing Kenyan numbers through Africa's Talking and everything
 * else through Twilio. Falls back to the other provider if the primary send
 * fails and the fallback is configured.
 */
export async function sendSms(to: string, body: string, statusCallback?: string): Promise<string> {
  const e164 = normalizePhoneE164(to) ?? to // let the provider reject if truly unparseable
  const primary: Provider = getPhoneCountry(e164) === "KE" && hasAfricasTalkingConfig() ? "at" : "twilio"

  try {
    return await dispatch(primary, e164, body, statusCallback)
  } catch (err) {
    const fallback: Provider = primary === "at" ? "twilio" : "at"
    if (!isConfigured(fallback)) throw err
    console.warn(`[sms] ${primary} failed, retrying via ${fallback}:`, err)
    return await dispatch(fallback, e164, body, statusCallback)
  }
}
