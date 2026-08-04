import Script from "next/script";

/** Only rendered once the visitor has accepted cookies — see ConsentGate. */
export function GoogleAnalyticsScripts() {
  return (
    <>
      <Script async src="https://www.googletagmanager.com/gtag/js?id=G-5F8X2RNZMJ" strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-5F8X2RNZMJ');
        `}
      </Script>
    </>
  );
}
