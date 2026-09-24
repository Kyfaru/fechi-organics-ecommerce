import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/** Normalises any common phone format to E.164 (e.g. "+254712345678"). Returns null if unparseable. */
export function normalizePhoneE164(raw: string, defaultCountry: CountryCode = "KE"): string | null {
  const parsed = parsePhoneNumberFromString(raw, defaultCountry);
  return parsed?.isValid() ? parsed.number : null;
}

/** Returns the ISO country (e.g. "KE") of an E.164 number, if determinable. */
export function getPhoneCountry(e164: string): CountryCode | undefined {
  return parsePhoneNumberFromString(e164)?.country;
}

/**
 * Combines the legacy two-column account-profile phone (local digits + separate
 * dial code, e.g. phone="0712345678" phoneCode="+254") into one E.164 string.
 * Needed because these two columns are stored separately and were never joined
 * before being handed to an SMS provider.
 *
 * `phone` may itself already carry the country code (e.g. a "0712345678" vs
 * "254712345678" vs "+254712345678" ambiguity from a raw, unvalidated input
 * field) — only stripping a leading zero and blindly prepending `phoneCode`
 * double-prefixes those into an invalid number (e.g. "+254254712345678"),
 * which silently fails to send. Detect and strip an already-present
 * `phoneCode` prefix first.
 */
export function combineLegacyPhone(phone: string, phoneCode: string | null): string | null {
  const cc = (phoneCode || "+254").replace(/[^\d+]/g, "");
  const ccDigits = cc.replace(/^\+/, "");
  let local = phone.replace(/[^\d+]/g, "");
  if (local.startsWith("+")) local = local.slice(1);
  local = local.startsWith(ccDigits) ? local.slice(ccDigits.length) : local.replace(/^0+/, "");
  return normalizePhoneE164(`${cc}${local}`);
}

/**
 * Inverse of combineLegacyPhone — splits a full E.164 number (as produced by
 * the react-phone-number-input-based PhoneInput component) back into the
 * legacy two-column shape for storage. Returns null if the number isn't a
 * valid, complete phone number.
 */
export function splitPhoneE164(e164: string): { phone: string; phoneCode: string } | null {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed?.isValid()) return null;
  return { phone: parsed.nationalNumber, phoneCode: `+${parsed.countryCallingCode}` };
}
