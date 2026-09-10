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
