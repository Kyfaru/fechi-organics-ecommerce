import { cookies } from "next/headers";
import { CONSENT_COOKIE } from "@/lib/cookie-consent";
import { GoogleAnalyticsScripts } from "./GoogleAnalyticsScripts";
import { CookieConsentBanner } from "./CookieConsentBanner";

/** Reads the consent cookie once and drives both the banner's visibility
 * and whether Google Analytics is allowed to load. Dynamic (reads
 * cookies()) — mount this wrapped in <Suspense> so it doesn't block the
 * rest of the page's PPR shell. */
export async function ConsentGate() {
  const devBypass = process.env.COOKIE_CONSENT_DEV_BYPASS === "true";
  const cookieStore = await cookies();
  const hasConsented = devBypass || cookieStore.get(CONSENT_COOKIE)?.value === "1";

  return (
    <>
      {hasConsented && <GoogleAnalyticsScripts />}
      <CookieConsentBanner initiallyConsented={hasConsented} />
    </>
  );
}
