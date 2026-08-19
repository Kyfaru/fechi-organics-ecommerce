/**
 * The message a customer copies to invite someone.
 *
 * Written to be pasted straight into WhatsApp or SMS, so:
 *  - first person, as if the customer wrote it themselves
 *  - under 200 characters, which keeps it inside a single SMS segment for
 *    GSM-7 text and stops WhatsApp collapsing it behind "read more"
 *  - `*CODE*` renders bold in WhatsApp and reads as emphasis in plain SMS
 *  - plain URLs, because SMS clients only auto-link bare links
 *
 * The "how it works" link is dropped rather than allowed to push the message
 * over the limit — the shop link and the code are what actually matter.
 */

import { REFERRAL_DISCOUNT_PERCENT } from "@/lib/points/rules";

export const INVITE_MAX_CHARS = 200;

export function buildInviteMessage(args: {
  referralCode: string;
  /** Origin of the storefront, e.g. https://fechiorganics.com */
  baseUrl: string;
}): string {
  const base = args.baseUrl.replace(/\/$/, "");
  const shopUrl = `${base}/shop`;
  const infoUrl = `${base}/loyalty-points`;
  const code = args.referralCode.trim().toUpperCase();

  const core =
    `Hi! I use Fechi Organics — use my code *${code}* for ` +
    `${REFERRAL_DISCOUNT_PERCENT}% off your first order & we both earn points. ${shopUrl}`;

  const withInfo = `${core} How it works: ${infoUrl}`;

  return withInfo.length <= INVITE_MAX_CHARS ? withInfo : core;
}

/** wa.me deep link for the "Share on WhatsApp" button. */
export function buildWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
