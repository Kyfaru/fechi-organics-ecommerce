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
 */
export function combineLegacyPhone(phone: string, phoneCode: string | null): string | null {
  const cc = (phoneCode || "+254").replace(/[^\d+]/g, "");
  const local = phone.replace(/^0+/, "");
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
