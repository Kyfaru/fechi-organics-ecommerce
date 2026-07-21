import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { Syne, DM_Sans } from "next/font/google";
import { vastago, stagnan, realHead } from "@/lib/fonts";
import { Providers } from "./providers";
import { SessionProvider } from "@/components/providers/session-provider";
import { Toaster } from "sonner";
import { WhatsAppButton } from "@/components/ui/WhatsAppButton";
import { ScrollToSearchMatch } from "@/components/search/ScrollToSearchMatch";
import { SITE_URL } from "@/lib/site";

const syne = Syne({ subsets: ["latin"], variable: "--font-syne-var", weight: ["600", "700"] });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-var", weight: ["400", "500", "600"] });

const description = "Pure ingredients. Your Signature. Your health.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Fechi Organics", template: "%s | Fechi Organics" },
  description,
  openGraph: {
    siteName: "Fechi Organics",
    type: "website",
    locale: "en_KE",
    description,
    images: [{ url: "/logo/logo-green.webp" }],
  },
  twitter: {
    card: "summary_large_image",
    description,
    images: ["/logo/logo-green.webp"],
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Fechi Organics",
  url: SITE_URL,
  logo: `${SITE_URL}/logo/logo-green.webp`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${syne.variable} ${dmSans.variable} ${vastago.variable} ${stagnan.variable} ${realHead.variable}`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        {/* Suspense boundary so PPR can generate a static shell for the html/body
            without blocking on the CurrencyProvider's fetch-on-mount. */}
        <Suspense>
          <Providers>
            <SessionProvider>
              {children}
              <Toaster position="bottom-right" richColors />
              <WhatsAppButton />
              <ScrollToSearchMatch />
            </SessionProvider>
          </Providers>
        </Suspense>
      </body>
    </html>
  );
}
